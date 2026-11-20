/**
 * Daily Open entries the server did not get: the three taps made while the phone was offline
 * (or the server failed), kept on the device until they can be sent.
 *
 * - A tap that fails with a network error or a server error is kept here, with the record it
 *   belongs to, the day it describes and the device's date when it was made.
 * - It is sent again when the browser comes back online, when the tab is shown again, and on
 *   the next app open (useRuntime in ./runtime.tsx). It goes out with the device's date at that
 *   moment, so a "today" sent the next morning counts as yesterday filled in, which the server
 *   allows.
 * - Sending twice is safe: the server ignores a second entry for the same day.
 * - A day that has closed by then (more than the engine's backfill window back) is dropped
 *   without a word to the person. So is an entry the server refuses for good (the day closed on
 *   its clock, the consent was withdrawn, the app was switched off).
 * - What the server stored on a resend is handed once to the open screen (takeDelivered), so
 *   its own log of days knows the day too.
 *
 * No React in this file.
 */
import { canLogDailyFor } from '../engine';
import type { MeLive } from '../shared/api';
import { ApiRequestError, type StandingClient } from '../shared/client';
import { api, applyLive } from './api';
import { createSlot, device, deviceStorage, type KeyValueStore, type Slot } from './device';
import { today } from './today';

/** One Daily Open the server has not received yet. */
export interface PendingDaily {
  /** The record the entry belongs to. It is sent only while that record is signed in here. */
  userId: string;
  /** The device's local date when the taps were made, YYYY-MM-DD. */
  localDate: string;
  /** The day the taps describe, YYYY-MM-DD. */
  day: string;
  sleep: number | null;
  exercise: number | null;
  state: number | null;
}

export interface PendingDailyState {
  /** Not sent yet, oldest day first. One per record and day: the first one stands, as on the server. */
  waiting: PendingDaily[];
  /** Stored by the server on a later send, until the open screen takes them for its log. */
  delivered: PendingDaily[];
}

export const PENDING_DAILY_VERSION = 1;
/** At most this many entries wait. Only today and yesterday can be sent, so this is room to spare. */
export const MAX_WAITING = 14;
/** At most this many delivered entries wait for the open screen. Older ones are of no use to its log. */
export const MAX_DELIVERED = 7;

const EMPTY: PendingDailyState = Object.freeze({ waiting: [] as PendingDaily[], delivered: [] as PendingDaily[] });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const tapOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

function reviveEntry(value: unknown): PendingDaily | null {
  if (!isRecord(value)) return null;
  const { userId, localDate, day } = value;
  if (typeof userId !== 'string' || userId === '') return null;
  if (typeof localDate !== 'string' || !DAY.test(localDate) || typeof day !== 'string' || !DAY.test(day)) return null;
  const entry = { userId, localDate, day, sleep: tapOf(value.sleep), exercise: tapOf(value.exercise), state: tapOf(value.state) };
  return entry.sleep === null && entry.exercise === null && entry.state === null ? null : entry;
}

function reviveState(value: unknown): PendingDailyState | null {
  if (!isRecord(value)) return null;
  const list = (raw: unknown) => (Array.isArray(raw) ? raw.map(reviveEntry).filter((e): e is PendingDaily => e !== null) : []);
  return { waiting: list(value.waiting), delivered: list(value.delivered) };
}

const sameEntry = (a: PendingDaily, b: PendingDaily) => a.userId === b.userId && a.day === b.day;

/** True when the day can no longer be recorded on `now`: it is further back than the backfill window. */
export function isClosed(day: string, now: string): boolean {
  return day < now && !canLogDailyFor(day, now);
}

/** True when the same request can work later: offline, a server error, a token or proxy problem. */
function retryLater(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return true;
  return error.retryable || error.code === 'unauthorized' || error.code === 'bad_response' || error.status === 408 || error.status === 429;
}

export interface PendingDailyOptions {
  storage: KeyValueStore;
  client: Pick<StandingClient, 'postDaily'>;
  /** The record signed in on this device, or null without a device token. */
  getUserId: () => string | null;
  /** The device's local date now, YYYY-MM-DD. */
  today: () => string;
  /** Gets the `live` block of each answer, so the screens show the entry at once. */
  onLive?: (live: MeLive | null) => void;
}

/** What attach() needs from a window. */
export interface PendingTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  document?: {
    visibilityState?: string;
    addEventListener?(type: string, listener: () => void): void;
    removeEventListener?(type: string, listener: () => void): void;
  };
}

export interface PendingDailyStore {
  get(): PendingDailyState;
  subscribe(listener: () => void): () => void;
  /** Keeps an entry the server did not get. A second one for the same record and day is ignored. */
  keep(entry: PendingDaily): void;
  /** The entries of a record still waiting to be sent, closed days left out. */
  waitingFor(userId: string | null): PendingDaily[];
  /** The entries of a record the server stored on a later send. Each is handed out once. */
  takeDelivered(userId: string | null): PendingDaily[];
  /** Sends what is waiting for the record signed in. Stops at the first failure that can work later. */
  flush(): Promise<void>;
  /** Sends on online and when the tab is shown again. Returns the undo. */
  attach(target: PendingTarget): () => void;
}

export function createPendingDaily(options: PendingDailyOptions): PendingDailyStore {
  const slot: Slot<PendingDailyState> = createSlot<PendingDailyState>({
    storage: options.storage,
    name: 'pending-daily',
    version: PENDING_DAILY_VERSION,
    empty: EMPTY,
    revive: reviveState,
  });

  const removeWaiting = (gone: PendingDaily) =>
    slot.update((s) => ({ ...s, waiting: s.waiting.filter((e) => !sameEntry(e, gone)) }));

  /** Drops the waiting entries whose day has closed. */
  const dropClosed = (now: string) =>
    slot.update((s) => (s.waiting.some((e) => isClosed(e.day, now)) ? { ...s, waiting: s.waiting.filter((e) => !isClosed(e.day, now)) } : s));

  let running: Promise<void> | null = null;
  let again = false;

  const run = async (): Promise<void> => {
    for (;;) {
      const userId = options.getUserId();
      if (!userId) return;
      const now = options.today();
      dropClosed(now);
      const next = slot.get().waiting.find((e) => e.userId === userId && canLogDailyFor(e.day, now));
      if (!next) return;
      try {
        const res = await options.client.postDaily({
          localDate: now,
          day: next.day,
          sleep: next.sleep,
          exercise: next.exercise,
          state: next.state,
        });
        slot.update((s) => ({
          waiting: s.waiting.filter((e) => !sameEntry(e, next)),
          // An entry the server already had is not this one: the first record stands there.
          delivered: res.stored ? [...s.delivered.filter((e) => !sameEntry(e, next)), next].slice(-MAX_DELIVERED) : s.delivered,
        }));
        options.onLive?.(res.live);
      } catch (error) {
        if (retryLater(error)) return;
        // Refused for good: the day closed on the server's clock, the consent was withdrawn, the
        // app was switched off. Nothing the person can do about it here.
        removeWaiting(next);
      }
    }
  };

  function flush(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await run();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    get: () => slot.get(),
    subscribe: (listener) => slot.subscribe(listener),
    keep(entry) {
      const clean = reviveEntry(entry);
      if (!clean) return;
      const now = options.today();
      slot.update((s) => {
        const open = s.waiting.filter((e) => !isClosed(e.day, now));
        if (open.some((e) => sameEntry(e, clean))) return open.length === s.waiting.length ? s : { ...s, waiting: open };
        const waiting = [...open, clean].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).slice(-MAX_WAITING);
        return { ...s, waiting };
      });
    },
    waitingFor(userId) {
      if (!userId) return [];
      const now = options.today();
      return slot.get().waiting.filter((e) => e.userId === userId && !isClosed(e.day, now));
    },
    takeDelivered(userId) {
      const { delivered } = slot.get();
      if (delivered.length === 0) return [];
      const mine = userId ? delivered.filter((e) => e.userId === userId) : [];
      // Entries of another record are of no use to this one's log.
      slot.update((s) => ({ ...s, delivered: [] }));
      return mine;
    },
    flush,
    attach(target) {
      const onOnline = () => void flush();
      const onVisibility = () => {
        if (target.document?.visibilityState !== 'hidden') void flush();
      };
      const doc = target.document;
      const visibilityTarget = doc?.addEventListener && doc.removeEventListener ? (doc as PendingTarget) : target;
      target.addEventListener('online', onOnline);
      visibilityTarget.addEventListener('visibilitychange', onVisibility);
      return () => {
        target.removeEventListener('online', onOnline);
        visibilityTarget.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

let defaultStore: PendingDailyStore | null = null;

/** The pending Daily Open entries of this page, sent with the page's API client. */
export function pendingDaily(): PendingDailyStore {
  if (!defaultStore) {
    defaultStore = createPendingDaily({
      storage: deviceStorage(),
      client: api,
      getUserId: () => {
        const record = device().get();
        return record.deviceToken ? record.userId : null;
      },
      today: () => today(),
      onLive: applyLive,
    });
  }
  return defaultStore;
}
