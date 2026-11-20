// Daily Open taps kept on the device while offline, and their resend. An injected client,
// storage and clock: no network, no browser.

import { describe, expect, it } from 'vitest';
import { clearAllSlots, memoryStore, storageKey } from '@/client/device';
import { createPendingDaily, isClosed, MAX_WAITING, type PendingDaily, type PendingDailyOptions, type PendingTarget } from '@/client/pendingDaily';
import type { DailyEntryRequest, MeLive, MicroEntryResponse } from '@/shared/api';
import { ApiRequestError } from '@/shared/client';

const USER = 'user-aaaaaaaaaaaaaaaa';
const OTHER = 'user-bbbbbbbbbbbbbbbb';
const KEY = storageKey('pending-daily', 1);
const TODAY = '2026-11-20';
const YESTERDAY = '2026-11-19';

const entry = (day: string, fields: Partial<PendingDaily> = {}): PendingDaily => ({
  userId: USER,
  localDate: day,
  day,
  sleep: 3,
  exercise: 1,
  state: 2,
  ...fields,
});

const LIVE = { today: TODAY } as unknown as MeLive;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type Reply = MicroEntryResponse | ApiRequestError;

/** A client whose answers are queued by the test. With nothing queued it answers "stored". */
function fakeClient() {
  const sent: DailyEntryRequest[] = [];
  const replies: Reply[] = [];
  return {
    sent,
    replies,
    client: {
      async postDaily(body: DailyEntryRequest): Promise<MicroEntryResponse> {
        sent.push(body);
        const reply = replies.shift() ?? { stored: true, day: body.day ?? body.localDate, live: LIVE };
        if (reply instanceof ApiRequestError) throw reply;
        return reply;
      },
    },
  };
}

const offline = () => new ApiRequestError(0, 'network', 'Failed to fetch');
const refused = (status: number, code: 'day_closed' | 'health_consent_required' | 'feature_off' | 'unauthorized' | 'internal_error') =>
  new ApiRequestError(status, code, code);

function setup(options: Partial<PendingDailyOptions> & { now?: { day: string }; user?: { id: string | null } } = {}) {
  const storage = options.storage ?? memoryStore();
  const fake = fakeClient();
  const now = options.now ?? { day: TODAY };
  const user = options.user ?? { id: USER };
  const lives: Array<MeLive | null> = [];
  const store = createPendingDaily({
    storage,
    client: options.client ?? fake.client,
    getUserId: () => user.id,
    today: () => now.day,
    onLive: (live) => lives.push(live),
  });
  return { store, storage, now, user, lives, ...fake };
}

describe('the pending Daily Open store', () => {
  it('keeps an entry under its versioned key, and a reload reads it back', () => {
    const { store, storage } = setup();
    store.keep(entry(TODAY));
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ waiting: [entry(TODAY)], delivered: [] });
    // A reload of the page: a new store over the same storage.
    const again = setup({ storage });
    expect(again.store.waitingFor(USER)).toEqual([entry(TODAY)]);
    expect(again.store.waitingFor(OTHER)).toEqual([]);
    expect(again.store.waitingFor(null)).toEqual([]);
  });

  it('keeps one entry per record and day: the first stands, as on the server', () => {
    const { store } = setup();
    store.keep(entry(TODAY, { sleep: 4 }));
    store.keep(entry(TODAY, { sleep: 0 }));
    store.keep(entry(YESTERDAY));
    store.keep(entry(TODAY, { userId: OTHER }));
    expect(store.get().waiting).toEqual([entry(YESTERDAY), entry(TODAY, { sleep: 4 }), entry(TODAY, { userId: OTHER })]);
    expect(store.waitingFor(USER).map((e) => e.day)).toEqual([YESTERDAY, TODAY]);
  });

  it('refuses an entry without a tap, and a damaged stored value reads as empty', () => {
    const { store } = setup();
    store.keep(entry(TODAY, { sleep: null, exercise: null, state: null }));
    store.keep({ ...entry(TODAY), day: 'today' });
    expect(store.get().waiting).toEqual([]);
    const storage = memoryStore({ [KEY]: '{not json' });
    expect(setup({ storage }).store.get()).toEqual({ waiting: [], delivered: [] });
    const partly = memoryStore({ [KEY]: JSON.stringify({ waiting: [entry(TODAY), { day: 3 }, null], delivered: 'x' }) });
    expect(setup({ storage: partly }).store.get()).toEqual({ waiting: [entry(TODAY)], delivered: [] });
  });

  it('holds a bounded number of entries', () => {
    const { store, now } = setup();
    // Days ahead of a clock that moved back (a phone crossing time zones) are not closed, and
    // still cannot grow the list without end.
    now.day = '2026-10-01';
    for (let i = 0; i < MAX_WAITING + 5; i += 1) store.keep(entry(`2026-10-${String(i + 1).padStart(2, '0')}`));
    expect(store.get().waiting.length).toBe(MAX_WAITING);
  });

  it('a day is closed once it is further back than the backfill window', () => {
    expect(isClosed(TODAY, TODAY)).toBe(false);
    expect(isClosed(YESTERDAY, TODAY)).toBe(false);
    expect(isClosed('2026-11-18', TODAY)).toBe(true);
    // A day ahead of the clock is not closed: the clock may catch up.
    expect(isClosed('2026-11-21', TODAY)).toBe(false);
  });
});

describe('the resend', () => {
  it('sends a kept entry with the date of the moment it goes out, and hands the live block on', async () => {
    const { store, sent, lives } = setup();
    store.keep(entry(TODAY));
    await store.flush();
    expect(sent).toEqual([{ localDate: TODAY, day: TODAY, sleep: 3, exercise: 1, state: 2 }]);
    expect(store.get().waiting).toEqual([]);
    expect(lives).toEqual([LIVE]);
    // Stored by the server: the open screen's log takes it once.
    expect(store.takeDelivered(USER)).toEqual([entry(TODAY)]);
    expect(store.takeDelivered(USER)).toEqual([]);
  });

  it('a "today" sent the next morning goes out as yesterday filled in', async () => {
    const { store, sent, now } = setup();
    store.keep(entry(TODAY));
    now.day = '2026-11-21';
    await store.flush();
    expect(sent).toEqual([{ localDate: '2026-11-21', day: TODAY, sleep: 3, exercise: 1, state: 2 }]);
  });

  it('a day that has closed is dropped without a request and without an error', async () => {
    const { store, sent, now, lives } = setup();
    store.keep(entry(YESTERDAY));
    store.keep(entry(TODAY));
    now.day = '2026-11-21';
    await expect(store.flush()).resolves.toBeUndefined();
    // Nov 19 is two days back on Nov 21: closed. Nov 20 is yesterday: still open.
    expect(sent.map((b) => b.day)).toEqual([TODAY]);
    expect(store.get().waiting).toEqual([]);
    expect(lives.length).toBe(1);
  });

  it('offline: the entry stays, and the next try sends it', async () => {
    const { store, sent, replies } = setup();
    store.keep(entry(TODAY));
    replies.push(offline());
    await store.flush();
    expect(sent.length).toBe(1);
    expect(store.waitingFor(USER)).toEqual([entry(TODAY)]);
    await store.flush();
    expect(sent.length).toBe(2);
    expect(store.waitingFor(USER)).toEqual([]);
  });

  it('a server error, an unknown failure or a token problem keeps the entry for later', async () => {
    for (const failure of [refused(500, 'internal_error'), refused(401, 'unauthorized'), new ApiRequestError(200, 'bad_response', 'html')]) {
      const { store, replies } = setup();
      store.keep(entry(TODAY));
      replies.push(failure);
      await store.flush();
      expect(store.waitingFor(USER), failure.code).toEqual([entry(TODAY)]);
    }
  });

  it('a refusal for good drops that entry without a word and goes on with the next', async () => {
    const { store, sent, replies } = setup();
    store.keep(entry(YESTERDAY));
    store.keep(entry(TODAY));
    replies.push(refused(409, 'day_closed'));
    await store.flush();
    expect(sent.map((b) => b.day)).toEqual([YESTERDAY, TODAY]);
    expect(store.get().waiting).toEqual([]);
    expect(store.takeDelivered(USER)).toEqual([entry(TODAY)]);

    for (const code of ['health_consent_required', 'feature_off'] as const) {
      const other = setup();
      other.store.keep(entry(TODAY));
      other.replies.push(refused(403, code));
      await other.store.flush();
      expect(other.store.get().waiting, code).toEqual([]);
    }
  });

  it('a day the server already had leaves the device and is not handed to the log', async () => {
    const { store, replies } = setup();
    store.keep(entry(TODAY));
    replies.push({ stored: false, day: TODAY, live: LIVE });
    await store.flush();
    expect(store.get().waiting).toEqual([]);
    expect(store.takeDelivered(USER)).toEqual([]);
  });

  it('sends nothing without a signed-in record, and only the entries of the record signed in', async () => {
    const { store, sent, user } = setup({ user: { id: null } });
    store.keep(entry(TODAY));
    store.keep(entry(TODAY, { userId: OTHER }));
    await store.flush();
    expect(sent).toEqual([]);
    user.id = OTHER;
    await store.flush();
    expect(sent.length).toBe(1);
    expect(store.get().waiting).toEqual([entry(TODAY)]);
    // Delivered entries of another record are of no use to this one's log.
    expect(store.takeDelivered(USER)).toEqual([]);
  });

  it('one flush at a time: a second call while sending waits for the same run', async () => {
    let release: () => void = () => undefined;
    const sent: string[] = [];
    const slow = {
      postDaily(body: DailyEntryRequest): Promise<MicroEntryResponse> {
        sent.push(body.day as string);
        return new Promise((resolve) => {
          release = () => resolve({ stored: true, day: body.day as string, live: null });
        });
      },
    };
    const { store } = setup({ client: slow });
    store.keep(entry(TODAY));
    const first = store.flush();
    const second = store.flush();
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(sent).toEqual([TODAY]);
    expect(store.get().waiting).toEqual([]);
  });

  it('goes out on the online event and when the tab is shown again', async () => {
    const listeners = new Map<string, () => void>();
    const docListeners = new Map<string, () => void>();
    const doc = {
      visibilityState: 'visible',
      addEventListener: (type: string, fn: () => void) => void docListeners.set(type, fn),
      removeEventListener: (type: string) => void docListeners.delete(type),
    };
    const target: PendingTarget = {
      addEventListener: (type, fn) => void listeners.set(type, fn),
      removeEventListener: (type) => void listeners.delete(type),
      document: doc,
    };
    const { store, sent, replies } = setup();
    const undo = store.attach(target);
    store.keep(entry(TODAY));
    replies.push(offline());
    await store.flush();
    expect(sent.length).toBe(1);

    listeners.get('online')?.();
    await tick();
    expect(sent.length).toBe(2);
    expect(store.get().waiting).toEqual([]);

    store.keep(entry(TODAY));
    doc.visibilityState = 'hidden';
    docListeners.get('visibilitychange')?.();
    await tick();
    expect(sent.length).toBe(2);
    doc.visibilityState = 'visible';
    docListeners.get('visibilitychange')?.();
    await tick();
    expect(sent.length).toBe(3);
    expect(store.get().waiting).toEqual([]);

    undo();
    expect(listeners.size).toBe(0);
    expect(docListeners.size).toBe(0);
  });

  it('is emptied with the other slots when the person deletes their data', () => {
    const { store } = setup();
    store.keep(entry(TODAY));
    clearAllSlots();
    expect(store.get()).toEqual({ waiting: [], delivered: [] });
  });
});
