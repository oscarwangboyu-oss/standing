/**
 * The event queue: question events of the check and report events of the result page.
 *
 * - Every event is written to storage first, then sent at once: one request when a question is
 *   shown, one when it is answered, skipped or marked not applicable. Nothing waits for the end
 *   of the check (PROMPT.md 7.1), so the team can see where people leave.
 * - Offline or a server error: the events stay stored and are sent again with a growing delay
 *   (1, 2, 4 ... 60 seconds), when the browser comes back online, and when the tab is shown.
 * - When the page is hidden or closed the queue is flushed with `keepalive`, so the request
 *   outlives the page. What does not get out is still in storage for the next visit.
 * - Sending twice is safe. The server keys a question event on (session, seq, action) and the
 *   first answer to a question wins; a report event is keyed on its id. So delivery here is
 *   "at least once", and an event leaves storage only after the server answered.
 * - A batch is all or nothing on the server. An event the server refuses for good is dropped,
 *   named by `details.index`, and the rest is sent again. A refused question event that later
 *   ones depend on (wrong position, not on the path, no health consent) takes the later ones of
 *   that check with it, and `onRejected` tells the check to read its state from the server.
 *
 * No React in this file.
 */
import {
  MAX_EVENTS_PER_REQUEST,
  MAX_REPORT_EVENTS_PER_REQUEST,
  type ApiErrorCode,
  type QuestionEventInput,
  type ReportEventInput,
} from '../shared/api';
import { ApiRequestError, createClient } from '../shared/client';
import { createSlot, type KeyValueStore, type Slot } from './device';

export type QueueItem =
  | { kind: 'question'; sessionId: string; at: number; event: QuestionEventInput }
  | { kind: 'report'; sessionId: string; at: number; event: ReportEventInput };

/** Told to listeners when the server refused events for good and they were dropped. */
export interface Rejection {
  kind: QueueItem['kind'];
  sessionId: string;
  code: ApiErrorCode | 'network' | 'bad_response';
  status: number;
  details?: Record<string, unknown>;
  dropped: QueueItem[];
}

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface QueueOptions {
  storage: KeyValueStore;
  /** The bearer token. Without one nothing is sent and everything stays queued. */
  getToken: () => string | null | undefined;
  /** Replacement for the global fetch, for tests. */
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Milliseconds since the epoch. */
  now?: () => number;
  timers?: Timers;
  /** Delay before retry n (from 0): min(maxMs, baseMs * factor ** n). */
  backoff?: { baseMs: number; maxMs: number; factor: number };
  /** Events older than this are dropped when the queue is read. Seven days by default. */
  maxAgeMs?: number;
}

export interface EventQueue {
  /** Queues one question event and sends it. An event already queued for the same (session, seq, action) is not queued twice. */
  question(sessionId: string, event: QuestionEventInput): void;
  /** Queues one report event and sends it. */
  report(sessionId: string, event: ReportEventInput): void;
  /** Sends what is queued now. Resolves when the queue is empty or a retry is scheduled. `keepalive` lets the request outlive the page. */
  flush(options?: { keepalive?: boolean }): Promise<void>;
  /** flush(), then true when no question event of the session is left. Call before completing a check. */
  drain(sessionId: string): Promise<boolean>;
  /** Everything still queued, oldest first. */
  pending(): readonly QueueItem[];
  size(): number;
  /** Forgets every queued event of a check (the person deleted it, or it is gone on the server). */
  dropSession(sessionId: string): void;
  subscribe(listener: () => void): () => void;
  onRejected(listener: (rejection: Rejection) => void): () => void;
  /** Listens for online, pagehide and visibilitychange. Returns the undo. */
  attach(target: QueueTarget): () => void;
  /** Milliseconds until the scheduled retry, or null when none is scheduled. */
  retryIn(): number | null;
}

/** What attach() needs from a window. */
export interface QueueTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  /** visibilitychange is listened for here when the document can listen, otherwise on the target. */
  document?: {
    visibilityState?: string;
    addEventListener?(type: string, listener: () => void): void;
    removeEventListener?(type: string, listener: () => void): void;
  };
}

export const QUEUE_VERSION = 1;
export const DEFAULT_BACKOFF = { baseMs: 1000, maxMs: 60_000, factor: 2 } as const;
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The identity of an item: what the server would call the same event. */
export function queueKey(item: QueueItem): string {
  return item.kind === 'question'
    ? `q:${item.sessionId}:${item.event.seq}:${item.event.action}`
    : `r:${item.sessionId}:${item.event.id}`;
}

/** Codes after which later question events of the same check cannot land either. */
const BREAKS_THE_PATH: ReadonlySet<string> = new Set(['event_out_of_order', 'event_not_on_path', 'health_consent_required']);
/** Codes that say the whole check takes nothing more. */
const SESSION_CLOSED: ReadonlySet<string> = new Set(['session_completed', 'not_found']);

function reviveItems(value: unknown): QueueItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (item): item is QueueItem =>
      typeof item === 'object' &&
      item !== null &&
      (item.kind === 'question' || item.kind === 'report') &&
      typeof item.sessionId === 'string' &&
      typeof item.at === 'number' &&
      typeof item.event === 'object' &&
      item.event !== null,
  );
}

export function createQueue(options: QueueOptions): EventQueue {
  const now = options.now ?? (() => Date.now());
  const timers: Timers = options.timers ?? {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  const slot: Slot<QueueItem[]> = createSlot<QueueItem[]>({
    storage: options.storage,
    name: 'queue',
    version: QUEUE_VERSION,
    empty: [],
    revive: reviveItems,
  });

  let keepalive = false;
  const baseFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const client = createClient({
    baseUrl: options.baseUrl,
    getToken: options.getToken,
    fetch: (input, init) => baseFetch(input, keepalive ? { ...init, keepalive: true } : init),
  });

  const rejectionListeners = new Set<(rejection: Rejection) => void>();
  let attempt = 0;
  let timer: unknown = null;
  let timerDueAt: number | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  // Old events are of no use to anyone: drop them once, when the queue is first read.
  const fresh = slot.get().filter((item) => now() - item.at <= maxAgeMs);
  if (fresh.length !== slot.get().length) slot.set(fresh);

  const remove = (gone: readonly QueueItem[]) => {
    if (gone.length === 0) return;
    const keys = new Set(gone.map(queueKey));
    slot.update((items) => items.filter((item) => !keys.has(queueKey(item))));
  };

  const cancelTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    timerDueAt = null;
  };

  const scheduleRetry = () => {
    cancelTimer();
    const delay = Math.min(backoff.maxMs, backoff.baseMs * backoff.factor ** attempt);
    attempt += 1;
    timerDueAt = now() + delay;
    timer = timers.set(() => {
      timer = null;
      timerDueAt = null;
      void flush();
    }, delay);
  };

  /** The head of the queue and everything of the same kind and check behind it, in order. */
  const nextBatch = (items: readonly QueueItem[]): QueueItem[] => {
    const head = items[0];
    const max = head.kind === 'question' ? MAX_EVENTS_PER_REQUEST : MAX_REPORT_EVENTS_PER_REQUEST;
    return items.filter((item) => item.kind === head.kind && item.sessionId === head.sessionId).slice(0, max);
  };

  const send = async (batch: readonly QueueItem[]): Promise<void> => {
    const head = batch[0];
    if (head.kind === 'question') {
      await client.postEvents(
        head.sessionId,
        batch.map((item) => item.event as QuestionEventInput),
      );
    } else {
      await client.postReportEvents(
        head.sessionId,
        batch.map((item) => item.event as ReportEventInput),
      );
    }
  };

  /** Decides what a final refusal costs, drops it and tells the listeners. */
  const reject = (batch: readonly QueueItem[], error: ApiRequestError) => {
    const head = batch[0];
    const index = error.details?.index;
    const named = typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < batch.length ? batch[index] : null;
    const sameCheck = (item: QueueItem) => item.kind === head.kind && item.sessionId === head.sessionId;
    let dropped: QueueItem[];
    if (SESSION_CLOSED.has(error.code)) {
      // The check is completed or gone: nothing of it can be stored any more.
      dropped = slot.get().filter((item) => item.sessionId === head.sessionId && (error.code === 'not_found' || sameCheck(item)));
    } else if (named && named.kind === 'question' && BREAKS_THE_PATH.has(error.code)) {
      const from = named.event.seq;
      dropped = slot
        .get()
        .filter((item) => item.kind === 'question' && item.sessionId === head.sessionId && item.event.seq >= from);
    } else if (named) {
      dropped = [named];
    } else {
      // The server did not say which one. The batch as a whole cannot be stored.
      dropped = [...batch];
    }
    remove(dropped);
    const rejection: Rejection = {
      kind: head.kind,
      sessionId: head.sessionId,
      code: error.code,
      status: error.status,
      details: error.details,
      dropped,
    };
    for (const listener of [...rejectionListeners]) listener(rejection);
  };

  /** True when trying again later can work: offline, a server error, a token problem, a proxy answer. */
  const canRetry = (error: unknown): boolean => {
    if (!(error instanceof ApiRequestError)) return true;
    return (
      error.retryable ||
      error.code === 'unauthorized' ||
      error.code === 'bad_response' ||
      error.status === 408 ||
      error.status === 429
    );
  };

  const run = async (): Promise<void> => {
    for (;;) {
      const items = slot.get();
      if (items.length === 0) {
        attempt = 0;
        return;
      }
      // Without a token the server would refuse everything. Wait for the next trigger.
      if (!options.getToken()) return;
      const batch = nextBatch(items);
      try {
        await send(batch);
        remove(batch);
        attempt = 0;
      } catch (error) {
        if (canRetry(error)) {
          scheduleRetry();
          return;
        }
        reject(batch, error as ApiRequestError);
      }
    }
  };

  function flush(flushOptions: { keepalive?: boolean } = {}): Promise<void> {
    if (flushOptions.keepalive) keepalive = true;
    if (running) {
      again = true;
      return running;
    }
    cancelTimer();
    running = (async () => {
      try {
        do {
          again = false;
          await run();
        } while (again && timer === null);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  const enqueue = (item: QueueItem) => {
    const key = queueKey(item);
    if (slot.get().some((queued) => queueKey(queued) === key)) return;
    slot.set([...slot.get(), item]);
    void flush();
  };

  return {
    question: (sessionId, event) => enqueue({ kind: 'question', sessionId, at: now(), event }),
    report: (sessionId, event) => enqueue({ kind: 'report', sessionId, at: now(), event }),
    flush,
    async drain(sessionId) {
      await flush();
      return !slot.get().some((item) => item.kind === 'question' && item.sessionId === sessionId);
    },
    pending: () => slot.get(),
    size: () => slot.get().length,
    dropSession: (sessionId) => slot.update((items) => items.filter((item) => item.sessionId !== sessionId)),
    subscribe: (listener) => slot.subscribe(listener),
    onRejected(listener) {
      rejectionListeners.add(listener);
      return () => void rejectionListeners.delete(listener);
    },
    attach(target) {
      const onOnline = () => {
        attempt = 0;
        void flush();
      };
      const onHide = () => void flush({ keepalive: true });
      const onVisibility = () => {
        if (target.document?.visibilityState === 'hidden') {
          onHide();
        } else {
          keepalive = false;
          void flush();
        }
      };
      const onShow = () => {
        keepalive = false;
      };
      const doc = target.document;
      const visibilityTarget = doc?.addEventListener && doc.removeEventListener ? (doc as QueueTarget) : target;
      target.addEventListener('online', onOnline);
      target.addEventListener('pagehide', onHide);
      target.addEventListener('pageshow', onShow);
      visibilityTarget.addEventListener('visibilitychange', onVisibility);
      return () => {
        target.removeEventListener('online', onOnline);
        target.removeEventListener('pagehide', onHide);
        target.removeEventListener('pageshow', onShow);
        visibilityTarget.removeEventListener('visibilitychange', onVisibility);
      };
    },
    retryIn: () => (timerDueAt === null ? null : Math.max(0, timerDueAt - now())),
  };
}
