// GET /api/me, `live`: the day-by-day price the home page shows, computed by the engine from
// the stored checks and micro-app records, and "why it moved" between two days.
//
// The person here is a full-time employee who answers every question with the second option,
// so sleep (B3) and weekly exercise (B2) start low and months of savings (W3) is "2 weeks to
// 1 month". The check is taken on 2026-03-02, a Monday. The clock is moved by hand and the
// UTC date of the clock is used as the device's local date.

import { beforeAll, describe, expect, it } from 'vitest';
import type { MeLive } from '@/shared/api';
import {
  AREA_IDS,
  addDays,
  createTestVariantAlgo,
  getAlgo,
  registerAlgo,
  timeline,
  type Breakdown,
  type DailyEntry,
  type PaydayBands,
  type PeopleNudgeEntry,
  type Step,
  type WeeklyWinEntry,
} from '@/engine';
import { dailyWindowOf, weekWindowOf } from '@/server/live';
import { answer, backgroundFor, completedCheck, makeApi, newSession, newUser, today, type TestApi } from './helpers/api';

const DAY0 = '2026-03-02';
const DAY_MS = 86_400_000;
const round2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
const sum = (lines: Array<{ points: number }>) => lines.reduce((total, line) => total + line.points, 0);

describe('the live series', () => {
  let api: TestApi;
  let token: string;
  let steps: Step[];
  let first: any;
  // What was sent, kept to hand the engine the same history.
  const daily: DailyEntry[] = [];
  const paydays: PaydayBands[] = [];
  const wins: WeeklyWinEntry[] = [];
  const nudges: PeopleNudgeEntry[] = [];
  let seq = 0;

  const me = async (): Promise<MeLive> => {
    const res = await api.call('GET', `/api/me?today=${today(api)}`, { token });
    if (res.status !== 200) throw new Error(res.text);
    return res.body.live;
  };
  const nextDay = () => api.advance(DAY_MS);
  const postDaily = async (taps: { sleep: number | null; exercise: number | null; state: number | null }, day?: string) => {
    const localDate = today(api);
    const res = await api.call('POST', '/api/daily', { token, body: { localDate, ...(day ? { day } : {}), ...taps } });
    if (res.status !== 201) throw new Error(res.text);
    daily.push({ day: day ?? localDate, loggedOn: localDate, ...taps });
    return res.body.live as MeLive;
  };
  /** The series the engine gives for everything sent so far. */
  const expected = () =>
    timeline({
      checks: [{ day: DAY0, background: backgroundFor('emp'), steps, bankVersion: '2.1', excludedAreas: [] }],
      daily,
      paydays,
      weeklyWins: wins,
      peopleNudges: nudges,
      until: today(api),
    });
  const sameAsEngine = (live: MeLive) => {
    const tl = expected();
    expect(live.series.start).toBe(DAY0);
    expect(live.series.length).toBe(tl.points.length);
    expect(live.series.overall).toEqual(tl.points.map((p) => round2(p.overall)));
    for (const area of AREA_IDS) {
      expect(live.series.sectors[area], area).toEqual(tl.points.map((p) => round2(p.sectors[area].price)));
      const last = tl.points[tl.points.length - 1].sectors[area];
      expect([area, live.sectors[area].status, live.sectors[area].price, live.sectors[area].target]).toEqual([area, last.status, last.price, last.target]);
    }
    expect(live.markers).toEqual(tl.markers);
    expect(live.overall.price).toBe(tl.points[tl.points.length - 1].overall);
  };

  beforeAll(async () => {
    api = await makeApi({ now: `${DAY0}T12:00:00.000Z` });
    const user = await newUser(api);
    token = user.deviceToken;
    const check = await completedCheck(api, token);
    steps = check.steps;
    first = check.result;
  });

  it('is null before the first check and never needs a sign-up', async () => {
    const stranger = await newUser(api);
    const res = await api.call('GET', '/api/me', { token: stranger.deviceToken });
    expect(res.status).toBe(200);
    expect(res.body.live).toBeNull();
    expect((await api.call('GET', '/api/me?today=2026-13-01', { token })).status).toBe(400);
    // A device clock days off still reads its prices, on the server's day.
    const skewed = await api.call('GET', '/api/me?today=2026-03-09', { token });
    expect(skewed.status).toBe(200);
    expect(skewed.body.live.today).toBe(api.now().toISOString().slice(0, 10));
  });

  it('day 0: one point at the price of the check, no change yet', async () => {
    const live = await me();
    expect(live.today).toBe(DAY0);
    expect(live.series).toEqual({
      start: DAY0,
      length: 1,
      overall: [round2(first.overall)],
      sectors: Object.fromEntries(AREA_IDS.map((a) => [a, [round2(first.sectors[a].price)]])),
    });
    expect(live.overall).toEqual({
      price: first.overall,
      target: first.overall,
      change: null,
      changePercent: null,
      sinceCheck: 0,
      sinceCheckPercent: 0,
      covers: live.overall.covers,
    });
    expect([...live.overall.covers].sort()).toEqual([...AREA_IDS].sort());
    for (const area of AREA_IDS) {
      expect(live.sectors[area]).toEqual({
        status: 'listed',
        price: first.sectors[area].price,
        target: first.sectors[area].price,
        change: null,
        sinceCheck: 0,
        dailyLimit: null,
        resumed: false,
        haltedSince: null,
      });
    }
    expect(live.markers).toEqual([{ day: DAY0, kind: 'full_check' }]);
    expect(live.halts).toEqual([]);
    expect(live.allTime).toEqual({ high: first.overall, highDay: DAY0, low: first.overall, lowDay: DAY0 });
    expect(live.lastCheckDay).toBe(DAY0);
    expect(live.mindNotice).toBe(false);
    // Yesterday is before the first check: it is not offered for filling in.
    expect(live.streak).toEqual({ current: 0, recordedToday: false, canBackfill: [], lastDay: null, firstDay: DAY0 });
    const unused = { enabled: true, available: true, recordedToday: false, recordedThisWeek: false, lastDay: null };
    // The counting windows come from the algorithm in force: 4 of 7 days, 4 of 8 weeks.
    expect(live.apps).toEqual({
      dailyOpen: { ...unused, window: { have: 0, need: 4, of: 7 } },
      payday: { ...unused, window: null, eligible: true, baseline: { day: DAY0, runwayKey: 'base', runwayOption: 1 } },
      weeklyWin: { ...unused, window: { have: 0, need: 4, of: 8 } },
      peopleNudge: { ...unused, window: { have: 0, need: 4, of: 8 } },
    });
    expect(live.retake).toEqual({ due: false, daysSinceCheck: 0, daysUntil: 90, dueDay: '2026-05-31' });
    expect(live.moveLimit).toBe(2);
    // The stage 1 fields are still there.
    const whole = await api.call('GET', '/api/me', { token });
    expect(whole.body.history.length).toBe(1);
    expect(whole.body.latest.result.overall).toBe(first.overall);
  });

  it('three days of good sleep change nothing; the fourth replaces the answer, 2 points a day at most', async () => {
    const good = { sleep: 3, exercise: 4, state: 4 };
    let live = await postDaily(good);
    for (let i = 0; i < 2; i += 1) {
      nextDay();
      live = await postDaily(good);
    }
    // 2026-03-04: three of the last seven days. The questionnaire answers still stand.
    expect(live.today).toBe('2026-03-04');
    expect(live.series.length).toBe(3);
    expect(live.sectors.B.target).toBe(first.sectors.B.price);
    expect(live.sectors.B.change).toBe(0);
    expect(live.overall.change).toBe(0);
    expect(live.streak).toMatchObject({ current: 3, recordedToday: true });
    expect(live.apps.dailyOpen.window).toEqual({ have: 3, need: 4, of: 7 });
    sameAsEngine(live);

    nextDay(); // 2026-03-05: the fourth day
    const before = await me();
    expect(before.apps.dailyOpen.recordedToday).toBe(false);
    expect(before.apps.dailyOpen.window).toEqual({ have: 3, need: 4, of: 7 });
    expect(before.sectors.B.change).toBe(0);
    live = await postDaily(good);
    expect(live.apps.dailyOpen).toMatchObject({ recordedToday: true, recordedThisWeek: true, lastDay: '2026-03-05', window: { have: 4, need: 4, of: 7 } });
    // The data now gives a much higher body price. The shown price goes up by the daily limit.
    const b = live.sectors.B;
    expect(b.target as number).toBeGreaterThan(first.sectors.B.price + 10);
    expect(b.price as number).toBeCloseTo(first.sectors.B.price + 2, 9);
    expect(b.change as number).toBeCloseTo(2, 9);
    expect(b.sinceCheck as number).toBeCloseTo(2, 9);
    expect([b.status, b.dailyLimit, b.resumed, b.haltedSince]).toEqual(['listed', 'up', false, null]);
    // The state tap is an extra item of the mind sector: it moves too, also capped.
    expect(live.sectors.M.dailyLimit).toBe('up');
    expect(live.sectors.M.change as number).toBeCloseTo(2, 9);
    // Wealth, capability and network have no new data.
    for (const area of ['W', 'C', 'N'] as const) expect([area, live.sectors[area].change, live.sectors[area].dailyLimit]).toEqual([area, 0, null]);
    // The overall price is the mean of five sectors: two of them moved 2 points.
    expect(live.overall.change as number).toBeCloseTo(4 / 5, 9);
    expect(live.overall.changePercent as number).toBeCloseTo((0.8 / first.overall) * 100, 9);
    expect(live.overall.sinceCheck as number).toBeCloseTo(0.8, 9);
    expect(live.overall.target as number).toBeGreaterThan(live.overall.price as number);
    expect(live.allTime).toMatchObject({ highDay: '2026-03-05', low: first.overall, lowDay: DAY0 });
    expect(live.allTime.high).toBe(live.overall.price);
    sameAsEngine(live);

    // The next day carries on from there without a new entry until it is made.
    nextDay(); // 2026-03-06
    live = await me();
    expect(live.sectors.B.price as number).toBeCloseTo(first.sectors.B.price + 4, 9);
    expect(live.series.sectors.B.slice(-3)).toEqual([round2(first.sectors.B.price), round2(first.sectors.B.price + 2), round2(first.sectors.B.price + 4)]);
    expect(live.streak).toMatchObject({ current: 4, recordedToday: false, canBackfill: [] });
    sameAsEngine(live);
  });

  it('why it moved: the latest change is explained line by line, from the daily records', async () => {
    const res = await api.call('GET', `/api/me/breakdown/day?today=${today(api)}`, { token });
    expect(res.status).toBe(200);
    // The data last gave a new price on 2026-03-05, when the fourth daily entry arrived.
    expect([res.body.from, res.body.to]).toEqual(['2026-03-04', '2026-03-05']);
    const b = res.body.breakdown as Breakdown;
    for (const area of AREA_IDS) {
      const sector = b.sectors[area];
      const prices = res.body.prices;
      expect(sector.before, area).toBe(prices.from.sectors[area].target);
      expect(sector.after, area).toBe(prices.to.sectors[area].target);
      expect(sum(sector.lines), area).toBeCloseTo(sector.delta as number, 9);
    }
    expect(sum(b.overall.lines)).toBeCloseTo(b.overall.delta as number, 9);
    expect(b.overall.delta as number).toBeGreaterThan(1);
    // Sleep and exercise replaced two answers; the state tap came in as an extra item.
    const lines = b.sectors.B.lines.concat(b.sectors.M.lines);
    expect(new Set(lines.map((l) => l.source))).toEqual(new Set(['daily_open']));
    expect(new Set(lines.map((l) => l.id))).toEqual(new Set(['B2', 'B3', 'daily_state']));
    // The shown price trails: it had moved 2 of those points that day.
    expect(res.body.prices.to.sectors.B.price).toBeCloseTo(res.body.prices.from.sectors.B.price + 2, 9);
    expect(res.body.prices.to.sectors.B.target).toBeGreaterThan(res.body.prices.to.sectors.B.price);

    // A chosen day against the day before, and two chosen days.
    const quiet = await api.call('GET', `/api/me/breakdown/day?day=2026-03-04&today=${today(api)}`, { token });
    expect([quiet.body.from, quiet.body.to, quiet.body.breakdown.changed, quiet.body.breakdown.overall.delta]).toEqual(['2026-03-03', '2026-03-04', 0, 0]);
    const span = await api.call('GET', `/api/me/breakdown/day?from=${DAY0}&day=2026-03-06&today=${today(api)}`, { token });
    expect([span.body.from, span.body.to]).toEqual([DAY0, '2026-03-06']);
    expect(span.body.breakdown.overall.delta).toBeCloseTo(b.overall.delta as number, 9);
    // The first day has no day before it.
    const start = await api.call('GET', `/api/me/breakdown/day?day=${DAY0}&today=${today(api)}`, { token });
    expect(start.body).toEqual({ from: null, to: DAY0, breakdown: null, prices: null });
    // Outside the series, and bad input.
    for (const query of ['day=2026-03-01', 'day=2026-03-07', `day=2026-03-05&from=2026-02-27`]) {
      expect((await api.call('GET', `/api/me/breakdown/day?${query}&today=${today(api)}`, { token })).status, query).toBe(404);
    }
    for (const query of ['day=soon', 'from=2026-03-03', 'day=2026-03-04&from=2026-03-05']) {
      expect((await api.call('GET', `/api/me/breakdown/day?${query}&today=${today(api)}`, { token })).status, query).toBe(400);
    }
    expect((await api.call('GET', '/api/me/breakdown/day', {})).status).toBe(401);
  });

  it('a payday band moves wealth the next days, a weekly win and a nudge are recorded', async () => {
    // 2026-03-06, a Friday. The runway estimate has reached "3 to 6 months" from the check of day 0.
    const body = { id: 'payday-entry-000001', localDate: today(api), periods: 1, saveShare: 2, runway: 3, baselineDay: DAY0 };
    const paid = await api.call('POST', '/api/payday', { token, body });
    expect(paid.status).toBe(201);
    paydays.push({ day: today(api), periods: 1, saveShare: 2, runway: 3, baselineDay: DAY0 });
    let live = paid.body.live as MeLive;
    const w = live.sectors.W;
    expect(w.target as number).toBeGreaterThan(first.sectors.W.price + 2);
    expect(w.price as number).toBeCloseTo(first.sectors.W.price + 2, 9);
    expect([w.dailyLimit, w.change]).toEqual(['up', w.change]);
    expect(w.change as number).toBeCloseTo(2, 9);
    expect(live.apps.payday).toMatchObject({ recordedToday: true, lastDay: '2026-03-06' });
    sameAsEngine(live);

    const won = await api.call('POST', '/api/weekly-wins', { token, body: { id: 'weekly-win-0000001', localDate: today(api), kind: 'course', hours: 2 } });
    wins.push({ day: today(api), kind: 'course', hours: 2 });
    const reached = await api.call('POST', '/api/people-nudges', {
      token,
      body: { id: 'people-nudge-00001', localDate: today(api), planned: 3, reached: ['mentor', 'friend'] },
    });
    // The server stores counts by category and hands the engine one entry per person, in the fixed category order.
    nudges.push({ day: today(api), planned: 3, reached: ['friend', 'mentor'] });
    expect([won.status, reached.status]).toEqual([201, 201]);
    live = reached.body.live;
    expect(live.apps.weeklyWin).toMatchObject({ recordedToday: true, recordedThisWeek: true, window: { have: 1, need: 4, of: 8 } });
    expect(live.apps.peopleNudge).toMatchObject({ recordedToday: true, recordedThisWeek: true, window: { have: 1, need: 4, of: 8 } });
    expect(live.apps.payday.window).toBeNull();
    sameAsEngine(live);

    // Monday of the next week: recorded this week is false again, the last day stays. The new
    // week does not count against the person yet: the window is the eight weeks before it.
    api.setNow('2026-03-09T12:00:00.000Z');
    live = await me();
    expect(live.apps.weeklyWin).toMatchObject({ recordedToday: false, recordedThisWeek: false, lastDay: '2026-03-06', window: { have: 1, need: 4, of: 8 } });
    expect(live.apps.peopleNudge.window).toEqual({ have: 1, need: 4, of: 8 });
    expect(live.apps.payday).toMatchObject({ recordedToday: false, recordedThisWeek: false, lastDay: '2026-03-06' });
    expect(live.sectors.W.price as number).toBeCloseTo(Math.min(live.sectors.W.target as number, first.sectors.W.price + 8), 9);
    sameAsEngine(live);
  });

  it('halts body and mind after 14 days without a daily entry, and resumes on the next one', async () => {
    // The last daily entry was for 2026-03-05. Day 14 after it is still listed.
    api.setNow('2026-03-19T12:00:00.000Z');
    let live = await me();
    expect([live.sectors.B.status, live.sectors.M.status]).toEqual(['listed', 'listed']);
    expect(live.halts).toEqual([]);

    api.setNow('2026-03-22T12:00:00.000Z');
    live = await me();
    for (const area of ['B', 'M'] as const) {
      expect(live.sectors[area]).toMatchObject({ status: 'halted', change: 0, dailyLimit: null, resumed: false, haltedSince: '2026-03-20' });
    }
    expect(live.halts).toEqual([
      { area: 'B', from: '2026-03-20', to: null },
      { area: 'M', from: '2026-03-20', to: null },
    ]);
    // Wealth is not halted: its limit is 45 days after the last payday check.
    expect(live.sectors.W.status).toBe('listed');
    // The streak is gone and yesterday can be filled in.
    expect(live.streak).toMatchObject({ current: 0, recordedToday: false, canBackfill: ['2026-03-21'], lastDay: '2026-03-05' });
    sameAsEngine(live);

    live = await postDaily({ sleep: 3, exercise: 3, state: 3 });
    for (const area of ['B', 'M'] as const) {
      expect(live.sectors[area]).toMatchObject({ status: 'listed', resumed: true, haltedSince: null });
    }
    expect(live.halts).toEqual([
      { area: 'B', from: '2026-03-20', to: '2026-03-21' },
      { area: 'M', from: '2026-03-20', to: '2026-03-21' },
    ]);
    expect(live.streak).toMatchObject({ current: 1, recordedToday: true });
    sameAsEngine(live);
    nextDay();
    expect((await me()).sectors.B.resumed).toBe(false);
  });

  it('shows the mind notice after five very bad days in seven', async () => {
    // 2026-03-23 to 2026-03-27.
    let live = await me();
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) nextDay();
      expect(live.mindNotice).toBe(false);
      live = await postDaily({ sleep: null, exercise: null, state: 0 });
    }
    expect(live.today).toBe('2026-03-27');
    expect(live.mindNotice).toBe(true);
    sameAsEngine(live);
  });

  it('counts down to the quarterly retake and holds the series end at the last record', async () => {
    api.setNow('2026-05-30T12:00:00.000Z');
    let live = await me();
    expect(live.retake).toEqual({ due: false, daysSinceCheck: 89, daysUntil: 1, dueDay: '2026-05-31' });
    api.setNow('2026-06-02T12:00:00.000Z');
    live = await me();
    expect(live.retake).toEqual({ due: true, daysSinceCheck: 92, daysUntil: 0, dueDay: '2026-05-31' });
    expect(live.series.length).toBe(93);
    // Everything is halted by now: body and mind, wealth (45 days), capability and network (28 days).
    expect(AREA_IDS.map((a) => live.sectors[a].status)).toEqual(AREA_IDS.map(() => 'halted'));
    sameAsEngine(live);
    // The response stays small: a quarter of daily points for six series.
    const text = JSON.stringify(live);
    expect(text.length).toBeLessThan(9000);

    // A device a day ahead of the server has already recorded "tomorrow": the series ends there.
    const res = await api.call('POST', '/api/weekly-wins', { token, body: { id: 'weekly-win-0000002', localDate: '2026-06-03', kind: 'skill' } });
    expect(res.status).toBe(201);
    wins.push({ day: '2026-06-03', kind: 'skill' });
    const plain = await api.call('GET', '/api/me', { token });
    expect(plain.body.live.today).toBe('2026-06-03');
    expect(plain.body.live.sectors.C.status).toBe('listed');
    expect(plain.body.live.sectors.C.resumed).toBe(true);
  });

  it('a second check is a marker, is not capped, and restarts the count', async () => {
    api.setNow('2026-06-04T12:00:00.000Z');
    const second = await completedCheck(api, token, { choose: () => 3 });
    const live = await me();
    expect(live.markers).toEqual([
      { day: DAY0, kind: 'full_check' },
      { day: '2026-06-04', kind: 'full_check' },
    ]);
    expect(live.lastCheckDay).toBe('2026-06-04');
    expect(live.overall.price).toBe(second.result.overall);
    expect(live.overall.change as number).toBeGreaterThan(10);
    expect(live.overall.sinceCheck).toBe(0);
    expect(live.retake).toMatchObject({ due: false, daysSinceCheck: 0, daysUntil: 90 });
    expect(AREA_IDS.map((a) => live.sectors[a].status)).toEqual(AREA_IDS.map(() => 'listed'));
    expect(live.apps.payday.baseline).toMatchObject({ day: '2026-06-04', runwayOption: 3 });
    expect(live.allTime).toMatchObject({ high: second.result.overall, highDay: '2026-06-04' });
  });

  it('draws a marker on the day a new algorithm version came into use', async () => {
    const variant = createTestVariantAlgo();
    registerAlgo(variant);
    try {
      await api.db.query(
        `insert into version_log (kind, version, effective_day, logged_at) values ('algo', $1, '2026-06-05', '2026-06-05T00:00:00.000Z')`,
        [String(variant.version)],
      );
      api.setNow('2026-06-06T12:00:00.000Z');
      const live = await me();
      const marker = live.markers[live.markers.length - 1];
      expect(marker).toEqual({
        day: '2026-06-05',
        kind: 'version_change',
        from: { algo: 1, bank: '2.1', norm: 'provisional-1' },
        to: { algo: variant.version, bank: '2.1', norm: 'provisional-1' },
      });
      // The day of the change is not capped: the price is the target of the new version at once.
      const index = live.series.length - 2;
      expect(live.series.overall[index]).not.toBe(live.series.overall[index - 1]);
      expect(live.overall.price).toBe(live.overall.target);
      // Before the logged change the series was computed with algorithm 1.
      expect(live.series.overall[0]).toBe(round2(first.overall));
    } finally {
      // The variant stays registered for the rest of this file, which ends here. Without a row in
      // the version log it is never in force.
      await api.db.query('delete from version_log');
    }
  });
});

describe('the day of a check', () => {
  it('is the local date it was started on, or the day it was finished when it was resumed days later', async () => {
    const api = await makeApi({ now: '2026-03-02T03:00:00.000Z' });
    const user = await newUser(api);
    // A device behind UTC: its local date is still March 1.
    await completedCheck(api, user.deviceToken, { localDate: '2026-03-01' });
    let live = (await api.call('GET', '/api/me?today=2026-03-01', { token: user.deviceToken })).body.live as MeLive;
    expect([live.series.start, live.lastCheckDay, live.today]).toEqual(['2026-03-01', '2026-03-01', '2026-03-01']);
    // Without `today` the server uses its UTC date.
    live = (await api.call('GET', '/api/me', { token: user.deviceToken })).body.live;
    expect([live.series.start, live.today, live.series.length]).toEqual(['2026-03-01', '2026-03-02', 2]);

    // A check finished five days after it was started counts from the day it was finished.
    await api.db.query(`update sessions set local_day = '2026-02-25'`);
    live = (await api.call('GET', '/api/me', { token: user.deviceToken })).body.live;
    expect([live.series.start, live.lastCheckDay]).toEqual(['2026-03-02', '2026-03-02']);
    expect(addDays(live.series.start, live.series.length - 1)).toBe(live.today);
  });

  it('is the local date the device sent at completion: a check resumed and finished in a US evening', async () => {
    const api = await makeApi({ now: '2026-11-17T15:00:00.000Z' });
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken, { role: 'emp', healthConsent: true, body: { localDate: '2026-11-17' } });
    await answer(api, user.deviceToken, session.id, backgroundFor('emp'), () => 1, { excludedAreas: [] });
    // Finished at 20:00 in Atlanta on November 19, which is 01:00 UTC on November 20.
    api.setNow('2026-11-20T01:00:00.000Z');
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken, body: { localDate: '2026-11-19' } });
    expect(done.status).toBe(200);
    const live = (await api.call('GET', '/api/me?today=2026-11-19', { token: user.deviceToken })).body.live as MeLive;
    expect([live.lastCheckDay, live.today]).toEqual(['2026-11-19', '2026-11-19']);
    // A Daily Open that evening counts for today.
    const daily = await api.call('POST', '/api/daily', {
      token: user.deviceToken,
      body: { localDate: '2026-11-19', day: '2026-11-19', sleep: 3, exercise: 2, state: 3 },
    });
    expect(daily.status).toBe(201);
    expect(daily.body.live.streak.recordedToday).toBe(true);
  });
});

describe('records made on the day of a full check', () => {
  it('count as a move since the check, under the daily limit, and Why it moved explains them', async () => {
    const api = await makeApi({ now: '2026-03-10T15:00:00.000Z' });
    const user = await newUser(api);
    await completedCheck(api, user.deviceToken, { localDate: '2026-03-10', choose: () => 1 });
    // Three earlier days and today: four of the last seven, so sleep and activity are replaced today.
    for (const d of ['2026-03-07', '2026-03-08', '2026-03-09']) {
      await api.db.query(
        `insert into daily_entries (user_id, day, logged_on, sleep, exercise, state, at) values ($1, $2, $2, 3, 4, null, $3)`,
        [user.userId, d, `${d}T20:00:00.000Z`],
      );
    }
    const posted = await api.call('POST', '/api/daily', {
      token: user.deviceToken,
      body: { localDate: '2026-03-10', day: '2026-03-10', sleep: 3, exercise: 4, state: null },
    });
    expect(posted.status).toBe(201);
    const live = posted.body.live as MeLive;
    const body = live.sectors.B;
    expect(body.sinceCheck).not.toBe(0);
    expect(Math.abs(body.sinceCheck as number)).toBeLessThanOrEqual(live.moveLimit + 1e-9);
    expect(live.overall.sinceCheck).not.toBe(0);

    const why = await api.call('GET', '/api/me/breakdown/day?today=2026-03-10', { token: user.deviceToken });
    expect(why.status).toBe(200);
    expect([why.body.from, why.body.to]).toEqual(['2026-03-10', '2026-03-10']);
    const lines = why.body.breakdown.sectors.B.lines as Array<{ source?: string; kind: string }>;
    expect(lines.length).toBeGreaterThan(0);
    expect(why.body.prices.from.sectors.B.price).not.toBe(why.body.prices.to.sectors.B.target);
  });
});

describe('the counting window of each micro app', () => {
  // The rules of the algorithm in force, read the way the server reads them.
  const rules = getAlgo().live;
  const MONDAY = '2026-03-02';
  const noon = (day: string) => `${day}T12:00:00.000Z`;

  const personWithCheck = async (api: TestApi) => {
    const user = await newUser(api);
    await completedCheck(api, user.deviceToken, { localDate: MONDAY });
    return user.deviceToken;
  };
  const liveOn = async (api: TestApi, token: string, day: string): Promise<MeLive> => {
    api.setNow(noon(day));
    const res = await api.call('GET', `/api/me?today=${day}`, { token });
    expect(res.status).toBe(200);
    return res.body.live;
  };

  it('Daily Open: days with an entry in the last 7, today included; the records count from the 4th', async () => {
    const { windowDays, minDays } = rules.dailyOpen;
    const api = await makeApi({ now: noon(MONDAY) });
    const token = await personWithCheck(api);
    const atCheck = (await liveOn(api, token, MONDAY)).sectors.B.price;
    for (let i = 0; i < minDays; i += 1) {
      const day = addDays(MONDAY, i);
      api.setNow(noon(day));
      const res = await api.call('POST', '/api/daily', { token, body: { localDate: day, sleep: 3, exercise: 4, state: 4 } });
      expect(res.status).toBe(201);
      const live = res.body.live as MeLive;
      expect(live.apps.dailyOpen.window).toEqual({ have: i + 1, need: minDays, of: windowDays });
      // The engine replaces the check answers on the day the window is full, not before.
      if (i + 1 < minDays) expect(live.sectors.B.target).toBe(atCheck);
      else expect(live.sectors.B.target).not.toBe(atCheck);
    }
    // Today without an entry yet still counts the six days before it.
    expect((await liveOn(api, token, addDays(MONDAY, minDays))).apps.dailyOpen.window).toEqual({ have: minDays, need: minDays, of: windowDays });
    // Later, with no entry since: the oldest days leave the window.
    const later = await liveOn(api, token, addDays(MONDAY, windowDays + 1));
    expect(later.apps.dailyOpen.window).toEqual({ have: minDays - 2, need: minDays, of: windowDays });
  });

  it('Daily Open: no entries counted without the Body and Mind consent', async () => {
    const api = await makeApi({ now: noon(MONDAY) });
    const user = await newUser(api, { health: false });
    await completedCheck(api, user.deviceToken, { localDate: MONDAY, healthConsent: false });
    const live = await liveOn(api, user.deviceToken, MONDAY);
    expect(live.apps.dailyOpen).toMatchObject({ available: false, window: { have: 0, need: rules.dailyOpen.minDays, of: rules.dailyOpen.windowDays } });
  });

  /**
   * Weekly Win and People Nudge share one rule: calendar weeks with an entry among the last 8,
   * 4 needed. The current week is one of them once it has its entry; until then the window is
   * the 8 weeks before it.
   */
  const weekly = [
    {
      app: 'weeklyWin' as const,
      path: '/api/weekly-wins',
      area: 'C' as const,
      rule: rules.weeklyWin.regularity,
      body: (i: number, day: string) => ({ id: `weekly-win-window-${i}`, localDate: day, kind: 'skill' }),
    },
    {
      app: 'peopleNudge' as const,
      path: '/api/people-nudges',
      area: 'N' as const,
      rule: rules.peopleNudge.reach,
      body: (i: number, day: string) => ({ id: `people-nudge-window-${i}`, localDate: day, planned: 3, reached: ['friend'] }),
    },
  ];

  for (const { app, path, area, rule, body } of weekly) {
    it(`${app}: weeks with an entry in the last ${rule.windowWeeks}; the records count from the ${rule.minWeeks}th`, async () => {
      const { windowWeeks, minWeeks } = rule;
      const api = await makeApi({ now: noon(MONDAY) });
      const token = await personWithCheck(api);
      const atCheck = (await liveOn(api, token, MONDAY)).sectors[area].price;
      const post = async (i: number, day: string) => {
        api.setNow(noon(day));
        const res = await api.call('POST', path, { token, body: body(i, day) });
        expect(res.status).toBe(201);
        return res.body.live as MeLive;
      };
      // One entry on the Wednesday of each week.
      for (let i = 0; i < minWeeks; i += 1) {
        const live = await post(i, addDays(MONDAY, 7 * i + 2));
        expect(live.apps[app].window).toEqual({ have: i + 1, need: minWeeks, of: windowWeeks });
        // The engine takes the extra item in on the week the window is full, not before.
        if (i + 1 < minWeeks) expect(live.sectors[area].target).toBe(atCheck);
        else expect(live.sectors[area].target).not.toBe(atCheck);
      }
      // The Monday after: the new week has no entry yet and does not count against the person.
      expect((await liveOn(api, token, addDays(MONDAY, 7 * minWeeks))).apps[app].window).toEqual({ have: minWeeks, need: minWeeks, of: windowWeeks });
      // Week `windowWeeks` without an entry: the window is weeks 0 to windowWeeks - 1, all four still in.
      expect((await liveOn(api, token, addDays(MONDAY, 7 * windowWeeks))).apps[app].window).toEqual({ have: minWeeks, need: minWeeks, of: windowWeeks });
      // One week on, week 0 has left the window.
      const late = addDays(MONDAY, 7 * (windowWeeks + 1));
      expect((await liveOn(api, token, late)).apps[app].window).toEqual({ have: minWeeks - 1, need: minWeeks, of: windowWeeks });
      // An entry this week puts the current week in and moves week 1 out.
      const live = await post(99, addDays(late, 1));
      expect(live.apps[app].window).toEqual({ have: minWeeks - 1, need: minWeeks, of: windowWeeks });
    });
  }

  it('the window functions read the rule they are given', () => {
    const until = '2026-03-11'; // a Wednesday
    const days = ['2026-03-01', '2026-03-09', '2026-03-10', '2026-03-10', '2026-03-11', '2026-03-12'].map((day) => ({ day }));
    // The last 3 days are 03-09 to 03-11. A day counts once; a day after `until` not at all.
    expect(dailyWindowOf(days, until, { windowDays: 3, minDays: 2 })).toEqual({ have: 3, need: 2, of: 3 });
    expect(dailyWindowOf(days, until, { windowDays: 11, minDays: 4 })).toEqual({ have: 4, need: 4, of: 11 });
    expect(dailyWindowOf([], until, rules.dailyOpen)).toEqual({ have: 0, need: rules.dailyOpen.minDays, of: rules.dailyOpen.windowDays });
    // Weeks start on Monday. 03-09 opens the current week, 03-01 is the Sunday of two weeks back.
    expect(weekWindowOf(days, until, { windowWeeks: 2, minWeeks: 1 })).toEqual({ have: 1, need: 1, of: 2 });
    expect(weekWindowOf(days, until, { windowWeeks: 3, minWeeks: 2 })).toEqual({ have: 2, need: 2, of: 3 });
    // Without an entry in the current week the window starts at the week before.
    expect(weekWindowOf([{ day: '2026-03-01' }], until, { windowWeeks: 2, minWeeks: 1 })).toEqual({ have: 1, need: 1, of: 2 });
    expect(weekWindowOf([{ day: '2026-03-01' }], until, { windowWeeks: 1, minWeeks: 1 })).toEqual({ have: 0, need: 1, of: 1 });
  });
});
