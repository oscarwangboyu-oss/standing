// The event queue with an injected fetch, storage, clock and timers. No network, no browser.

import { describe, expect, it } from 'vitest';
import { createQueue, queueKey, type QueueOptions, type QueueTarget, type Timers } from '@/client/queue';
import { memoryStore, storageKey } from '@/client/device';
import type { QuestionEventInput, ReportEventInput } from '@/shared/api';

const SESSION = 'session-aaaaaaaaaaaaaaaa';
const OTHER = 'session-bbbbbbbbbbbbbbbb';
const QUEUE_KEY = storageKey('queue', 1);

function shown(seq: number): QuestionEventInput {
  return {
    seq,
    action: 'shown',
    itemId: `q${seq}`,
    versionKey: 'v1',
    lang: 'en',
    optionIndex: null,
    seconds: null,
    displayDirection: 'best_first',
    clickPosition: null,
    bankVersion: 'bank-test',
  };
}

function select(seq: number): QuestionEventInput {
  return { ...shown(seq), action: 'select', optionIndex: 1, seconds: 4.2, clickPosition: 'middle' };
}

function seen(id: string): ReportEventInput {
  return { id, section: 'header', kind: 'seen' };
}

interface Sent {
  url: string;
  body: any;
  token: string | null;
  keepalive: boolean;
}

type Reply = { status: number; body?: unknown } | 'offline';

function harness(options: Partial<QueueOptions> & { initial?: Record<string, string> } = {}) {
  const storage = memoryStore(options.initial);
  const sent: Sent[] = [];
  const state = {
    token: 'device-token' as string | null,
    now: 1_000_000,
    reply: ((): Reply => ({ status: 200, body: { results: [] } })) as (request: Sent) => Reply | Promise<Reply>,
  };
  const scheduled: { run: () => void; ms: number; cleared: boolean }[] = [];
  const timers: Timers = {
    set(run, ms) {
      const entry = { run, ms, cleared: false };
      scheduled.push(entry);
      return entry;
    },
    clear(handle) {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
  const fetchDouble = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const request: Sent = {
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      token: headers.get('authorization')?.replace(/^Bearer /, '') ?? null,
      keepalive: init?.keepalive === true,
    };
    sent.push(request);
    const reply = await state.reply(request);
    if (reply === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const make = () =>
    createQueue({
      storage,
      getToken: () => state.token,
      fetch: fetchDouble,
      now: () => state.now,
      timers,
      ...options,
    });
  const queue = make();
  /** The timers that are still due. */
  const due = () => scheduled.filter((entry) => !entry.cleared);
  /** Runs the newest timer, as if its delay had passed. */
  const fire = async () => {
    const entry = due().at(-1);
    if (!entry) throw new Error('no timer is scheduled');
    entry.cleared = true;
    state.now += entry.ms;
    entry.run();
    await queue.flush();
  };
  const stored = () => JSON.parse(storage.getItem(QUEUE_KEY) ?? '[]') as unknown[];
  return { queue, make, storage, sent, state, scheduled, due, fire, stored };
}

const error = (status: number, code: string, details?: Record<string, unknown>): Reply => ({
  status,
  body: { error: { code, message: code, details } },
});

describe('the event queue', () => {
  it('sends one request when a question is shown and one when it is answered', async () => {
    const h = harness();
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    h.queue.question(SESSION, select(0));
    await h.queue.flush();

    expect(h.sent).toHaveLength(2);
    expect(h.sent[0].url).toBe(`/api/sessions/${SESSION}/events`);
    expect(h.sent[0].body.events).toEqual([shown(0)]);
    expect(h.sent[1].body.events).toEqual([select(0)]);
    expect(h.sent[0].token).toBe('device-token');
    expect(h.queue.size()).toBe(0);
    expect(h.stored()).toEqual([]);
  });

  it('writes an event to storage before it is sent and removes it only after the server answered', async () => {
    const h = harness();
    let release: (reply: Reply) => void = () => {};
    h.state.reply = () => new Promise<Reply>((resolve) => (release = resolve));
    h.queue.question(SESSION, shown(0));
    expect(h.stored()).toHaveLength(1);
    await Promise.resolve();
    expect(h.sent).toHaveLength(1);
    expect(h.stored()).toHaveLength(1);
    release({ status: 200, body: {} });
    await h.queue.flush();
    expect(h.stored()).toEqual([]);
  });

  it('does not queue the same (session, seq, action) twice', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(3));
    h.queue.question(SESSION, shown(3));
    h.queue.question(SESSION, select(3));
    h.queue.question(OTHER, shown(3));
    await h.queue.flush();
    expect(h.queue.pending().map(queueKey)).toEqual([`q:${SESSION}:3:shown`, `q:${SESSION}:3:select`, `q:${OTHER}:3:shown`]);
  });

  it('keeps events while offline and retries with a growing delay, capped', async () => {
    const h = harness({ backoff: { baseMs: 1000, maxMs: 5000, factor: 2 } });
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    expect(h.queue.size()).toBe(1);
    expect(h.due().map((t) => t.ms)).toEqual([1000]);
    expect(h.queue.retryIn()).toBe(1000);

    const delays: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      await h.fire();
      delays.push(h.due().at(-1)?.ms ?? -1);
    }
    expect(delays).toEqual([2000, 4000, 5000, 5000]);
    expect(h.queue.size()).toBe(1);

    // Back online: everything queued meanwhile goes out in order, in one request.
    h.queue.question(SESSION, select(0));
    await h.queue.flush();
    h.state.reply = () => ({ status: 200, body: {} });
    await h.fire();
    expect(h.queue.size()).toBe(0);
    expect(h.sent.at(-1)?.body.events).toEqual([shown(0), select(0)]);
    expect(h.queue.retryIn()).toBeNull();

    // The delay starts from the base again after a success.
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(1));
    await h.queue.flush();
    expect(h.due().at(-1)?.ms).toBe(1000);
  });

  it('retries a server error and a refused token, and keeps the events', async () => {
    const h = harness();
    h.state.reply = () => error(500, 'internal_error');
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    expect(h.queue.size()).toBe(1);
    h.state.reply = () => error(401, 'unauthorized');
    await h.fire();
    expect(h.queue.size()).toBe(1);
    expect(h.due()).toHaveLength(1);
  });

  it('sends nothing without a device token and sends once one exists', async () => {
    const h = harness();
    h.state.token = null;
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    expect(h.sent).toHaveLength(0);
    expect(h.queue.size()).toBe(1);
    h.state.token = 'device-token';
    await h.queue.flush();
    expect(h.sent).toHaveLength(1);
    expect(h.queue.size()).toBe(0);
  });

  it('survives a reload: a new queue over the same storage sends what was left', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    h.queue.question(SESSION, select(0));
    await h.queue.flush();
    expect(h.stored()).toHaveLength(2);

    h.state.reply = () => ({ status: 200, body: {} });
    const next = h.make();
    expect(next.size()).toBe(2);
    await next.flush();
    expect(next.size()).toBe(0);
    expect(h.sent.at(-1)?.body.events).toEqual([shown(0), select(0)]);
  });

  it('drops events older than the maximum age when it starts', () => {
    const old = { kind: 'question', sessionId: SESSION, at: 1_000_000 - 8 * 24 * 60 * 60 * 1000, event: shown(0) };
    const recent = { kind: 'question', sessionId: SESSION, at: 1_000_000 - 1000, event: shown(1) };
    const h = harness({ initial: { [QUEUE_KEY]: JSON.stringify([old, recent, { damaged: true }]) } });
    expect(h.queue.pending().map(queueKey)).toEqual([`q:${SESSION}:1:shown`]);
  });

  it('is safe to send twice: a duplicate answer from the server empties the queue', async () => {
    const h = harness();
    // The first attempt reached the server but the answer was lost.
    let first = true;
    h.state.reply = () => {
      if (first) {
        first = false;
        return 'offline';
      }
      return { status: 200, body: { results: [{ seq: 0, action: 'shown', status: 'duplicate' }] } };
    };
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    expect(h.queue.size()).toBe(1);
    await h.fire();
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1].body).toEqual(h.sent[0].body);
    expect(h.queue.size()).toBe(0);
  });

  it('groups by kind and check, in order, and sends report events to their own endpoint', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    h.queue.report(SESSION, seen('report-event-000001'));
    h.queue.question(OTHER, shown(0));
    h.queue.question(SESSION, select(0));
    h.queue.report(SESSION, seen('report-event-000002'));
    await h.queue.flush();
    h.sent.length = 0;
    h.state.reply = () => ({ status: 200, body: {} });
    await h.fire();

    expect(h.sent.map((s) => s.url)).toEqual([`/api/sessions/${SESSION}/events`, '/api/report-events', `/api/sessions/${OTHER}/events`]);
    expect(h.sent[0].body.events).toEqual([shown(0), select(0)]);
    expect(h.sent[1].body).toEqual({ sessionId: SESSION, events: [seen('report-event-000001'), seen('report-event-000002')] });
    expect(h.queue.size()).toBe(0);
  });

  it('never puts more than 80 question events in one request', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    for (let seq = 0; seq < 45; seq += 1) {
      h.queue.question(SESSION, shown(seq));
      h.queue.question(SESSION, select(seq));
    }
    await h.queue.flush();
    h.sent.length = 0;
    h.state.reply = () => ({ status: 200, body: {} });
    await h.fire();
    expect(h.sent.map((s) => s.body.events.length)).toEqual([80, 10]);
  });

  it('drops only the event the server names as invalid and sends the rest again', async () => {
    const h = harness();
    const rejections: string[] = [];
    h.queue.onRejected((r) => rejections.push(`${r.code}:${r.dropped.map(queueKey).join(',')}`));
    h.state.reply = () => 'offline';
    h.queue.report(SESSION, seen('report-event-000001'));
    h.queue.report(SESSION, seen('report-event-000002'));
    h.queue.report(SESSION, seen('report-event-000003'));
    await h.queue.flush();
    h.sent.length = 0;
    h.state.reply = (request) => (request.body.events.length === 3 ? error(422, 'invalid_request', { index: 1 }) : { status: 200, body: {} });
    await h.fire();

    expect(rejections).toEqual([`invalid_request:r:${SESSION}:report-event-000002`]);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1].body.events.map((e: ReportEventInput) => e.id)).toEqual(['report-event-000001', 'report-event-000003']);
    expect(h.queue.size()).toBe(0);
  });

  it('drops the later question events of a check when the path is broken, and says so', async () => {
    const h = harness();
    const rejections: { code: string; dropped: string[] }[] = [];
    h.queue.onRejected((r) => rejections.push({ code: r.code, dropped: r.dropped.map(queueKey) }));
    h.state.reply = () => 'offline';
    for (const event of [shown(4), select(4), shown(5), select(5)]) h.queue.question(SESSION, event);
    h.queue.question(OTHER, shown(0));
    await h.queue.flush();
    h.state.reply = (request) =>
      request.url.includes(SESSION) && request.body.events.length === 4 ? error(422, 'event_not_on_path', { index: 2, seq: 5 }) : { status: 200, body: {} };
    await h.fire();

    expect(rejections).toEqual([{ code: 'event_not_on_path', dropped: [`q:${SESSION}:5:shown`, `q:${SESSION}:5:select`] }]);
    // The two events before the break were sent again and stored; the other check was not touched.
    expect(h.sent.at(-2)?.body.events).toEqual([shown(4), select(4)]);
    expect(h.sent.at(-1)?.url).toBe(`/api/sessions/${OTHER}/events`);
    expect(h.queue.size()).toBe(0);
  });

  it('forgets every question event of a check the server has closed', async () => {
    const h = harness();
    const codes: string[] = [];
    h.queue.onRejected((r) => codes.push(r.code));
    h.state.reply = () => error(409, 'session_completed', { index: 0 });
    h.queue.question(SESSION, shown(0));
    h.queue.question(SESSION, select(0));
    await h.queue.flush();
    expect(codes).toEqual(['session_completed']);
    expect(h.queue.size()).toBe(0);
    expect(h.due()).toHaveLength(0);
  });

  it('drain says whether the question events of one check are all out', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    expect(await h.queue.drain(SESSION)).toBe(false);
    expect(await h.queue.drain(OTHER)).toBe(true);
    h.state.reply = () => ({ status: 200, body: {} });
    expect(await h.queue.drain(SESSION)).toBe(true);
  });

  it('dropSession forgets the events of one check only', async () => {
    const h = harness();
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    h.queue.report(SESSION, seen('report-event-000001'));
    h.queue.question(OTHER, shown(0));
    await h.queue.flush();
    h.queue.dropSession(SESSION);
    expect(h.queue.pending().map(queueKey)).toEqual([`q:${OTHER}:0:shown`]);
  });

  it('flushes with keepalive when the page is hidden, and retries at once when the browser is back online', async () => {
    const h = harness();
    const listeners = new Map<string, () => void>();
    const documentDouble = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void) => void listeners.set(`document:${type}`, listener),
      removeEventListener: (type: string) => void listeners.delete(`document:${type}`),
    };
    const target: QueueTarget = {
      addEventListener: (type, listener) => void listeners.set(type, listener),
      removeEventListener: (type) => void listeners.delete(type),
      document: documentDouble,
    };
    const detach = h.queue.attach(target);
    expect([...listeners.keys()].sort()).toEqual(['document:visibilitychange', 'online', 'pagehide', 'pageshow']);

    // Offline: the event waits for a retry that is a second away.
    h.state.reply = () => 'offline';
    h.queue.question(SESSION, shown(0));
    await h.queue.flush();
    expect(h.sent.at(-1)?.keepalive).toBe(false);
    expect(h.due()).toHaveLength(1);

    // The connection returns: no waiting for the timer.
    h.state.reply = () => ({ status: 200, body: {} });
    listeners.get('online')?.();
    await h.queue.flush();
    expect(h.queue.size()).toBe(0);
    expect(h.due()).toHaveLength(0);

    // The page is hidden while a request is in the air: what is left goes out with keepalive.
    let release: (reply: Reply) => void = () => {};
    h.state.reply = () => new Promise<Reply>((resolve) => (release = resolve));
    h.queue.question(SESSION, shown(1));
    await Promise.resolve();
    h.queue.question(SESSION, select(1));
    documentDouble.visibilityState = 'hidden';
    listeners.get('document:visibilitychange')?.();
    h.state.reply = () => ({ status: 200, body: {} });
    release({ status: 200, body: {} });
    await h.queue.flush();
    expect(h.sent.at(-1)?.body.events).toEqual([select(1)]);
    expect(h.sent.at(-1)?.keepalive).toBe(true);
    expect(h.queue.size()).toBe(0);

    // Shown again: later requests are ordinary ones.
    documentDouble.visibilityState = 'visible';
    listeners.get('document:visibilitychange')?.();
    h.queue.question(SESSION, shown(2));
    await h.queue.flush();
    expect(h.sent.at(-1)?.keepalive).toBe(false);

    detach();
    expect(listeners.size).toBe(0);
  });
});
