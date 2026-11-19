// The team dashboard, checked against one small dataset built by hand.
//
// Every row is inserted directly, so the right answer for every metric is known in advance and
// written out in the comments below. The clock stands at 2026-02-28 12:00 UTC.
//
// GROUP A: a1..a10, role emp, age band 2, one check each, started 2026-02-20.
//   a1..a9 completed, a10 did not. a10 is flagged as simulated.
//   B1: shown to all 10. a1..a7 selected options [3,3,3,3,3,4,1] in [1..7] seconds.
//       a8 and a9 skipped. a10 saw it and left (8 days ago).
//   B4: a1..a5 selected [6,0,1,2,3], all in 2 seconds. Option 6 is "not applicable" (score null).
//   B3: a1..a3 selected option 3 in [1,2,9] seconds.
//   N2: a1..a3 selected option 2 in [3,3,3] seconds.
//   Sector C price of the latest check: [70, 85, 100, 100, 100, 115, 115, 130, 137.5].
//
// GROUP U: u1..u10, role ug4, age band 0, one check each.
//   u1..u9 completed on 2026-02-20. u10 started 6 minutes ago and has not completed.
//   B1: shown to all 10. u1..u8 selected [3,3,3,3,3,4,2,2] in [8..15] seconds. u9 skipped.
//       u10 saw it 5 minutes ago (too recent to count as a drop-off).
//   Sector C price: [85,85,85,100,100,100,115,115,115]. u1..u3 also have a sector M price of 90.
//
// GROUP R: r1..r10, role emp, age band 3. Each has a first check completed 2026-01-10 and a
//   second one N days later; r1 has a third. Every check answers M1 in 5 seconds.
//        days  M1 first -> second   overall first -> second   retest pair?
//   r1    14        1 -> 1               100 -> 102            yes (third check, day 28: M1 4, overall 70)
//   r2    14        1 -> 1               110 -> 108            yes
//   r3    14        1 -> 2               120 -> 124            yes
//   r4    14        1 -> 3               130 -> 126            yes
//   r5     5        1 -> 4                60 -> 140            no, too soon
//   r6    30        1 -> 4                60 -> 140            no, too late
//   r7    10        1 -> 1                90 ->  95            yes, lower edge
//   r8    21        1 -> 0               140 -> 135            yes, upper edge
//   r9    22        0 -> 4                60 -> 140            no
//   r10    9        0 -> 4                60 -> 140            no
//   Sector C price of each check equals its overall price.

import { beforeAll, describe, expect, it } from 'vitest';
import { REPORT_SECTIONS, type TeamItemRow, type TeamNormRow, type TeamPriceRow } from '@/shared/api';
import { DASHBOARD_RED_LINES, GO_CRITERIA } from '@/engine';
import type { Db } from '@/server/db';
import { makeApi, TEAM_PASSPHRASE, type TestApi } from './helpers/api';

const NOW = '2026-02-28T12:00:00.000Z';

// ---------------------------------------------------------------- building the dataset

async function addUser(db: Db, id: string, demo = false): Promise<void> {
  await db.query(
    `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version,
       general_consent_at, health_consent_version, health_consent_at, lang, is_demo)
     values ($1, $2, $3, $2, 'general-1', $2, 'health-1', $2, 'en', $4)`,
    [id, '2026-01-01T00:00:00.000Z', `hash-of-${id}`, demo],
  );
}

async function addSession(
  db: Db,
  s: { id: string; user: string; role: string; age: number; created: string; completed: string | null },
): Promise<void> {
  await db.query(
    `insert into sessions (id, user_id, created_at, completed_at, local_day, age, role, extra, lang, bank_version, health_consent)
     values ($1, $2, $3, $4, $5, $6, $7, '{}', 'en', '2.1', true)`,
    [s.id, s.user, s.created, s.completed, s.created.slice(0, 10), s.age, s.role],
  );
}

/** A "shown" row, and an answer row unless `answer` is "none". */
async function addQuestion(
  db: Db,
  q: { session: string; user: string; seq: number; item: string; answer: number | 'skip' | 'none'; seconds?: number; at: string },
): Promise<void> {
  const insert = `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, option_index,
      seconds, display_direction, click_position, bank_version, at)
    values ($1, $2, $3, $4, $5, 'base', 'en', $6, $7, 'worst_first', $8, '2.1', $9)`;
  await db.query(insert, [q.session, q.seq, 'shown', q.user, q.item, null, null, null, q.at]);
  if (q.answer === 'skip') {
    await db.query(insert, [q.session, q.seq, 'skip', q.user, q.item, null, q.seconds ?? 2, null, q.at]);
  } else if (q.answer !== 'none') {
    await db.query(insert, [q.session, q.seq, 'select', q.user, q.item, q.answer, q.seconds ?? 5, 'middle', q.at]);
  }
}

/** The internal value a price corresponds to under the provisional norm (median 0.5, sd 0.2). */
const rawOf = (price: number) => 0.5 + ((price - 100) / 15) * 0.2;

async function addResult(
  db: Db,
  r: { session: string; user: string; overall: number; c?: number; m?: number; algo?: number; computedAt: string },
): Promise<void> {
  await db.query(
    `insert into results (session_id, algo_version, norm_version, bank_version, user_id, computed_at, overall,
       price_c, raw_c, price_m, raw_m, grade, result)
     values ($1, $2, 'provisional-1', '2.1', $3, $4, $5, $6, $7, $8, $9, 'A', '{}')`,
    [
      r.session,
      r.algo ?? 1,
      r.user,
      r.computedAt,
      r.overall,
      r.c ?? null,
      r.c === undefined ? null : rawOf(r.c),
      r.m ?? null,
      r.m === undefined ? null : rawOf(r.m),
    ],
  );
}

async function addVisit(db: Db, user: string, day: string): Promise<void> {
  await db.query('insert into visits (user_id, day, first_at) values ($1, $2, $3)', [user, day, `${day}T12:00:00.000Z`]);
}

async function addReportEvent(
  db: Db,
  e: { id: string; user: string; session: string; section: string; kind: string; ms?: number; useful?: boolean; at: string },
): Promise<void> {
  await db.query(
    'insert into report_events (user_id, id, session_id, section, kind, ms, useful, at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [e.user, e.id, e.session, e.section, e.kind, e.ms ?? null, e.useful ?? null, e.at],
  );
}

const A_PRICES = [70, 85, 100, 100, 100, 115, 115, 130, 137.5];
const U_PRICES = [85, 85, 85, 100, 100, 100, 115, 115, 115];
const R = [
  { days: 14, m1: [1, 1], overall: [100, 102] },
  { days: 14, m1: [1, 1], overall: [110, 108] },
  { days: 14, m1: [1, 2], overall: [120, 124] },
  { days: 14, m1: [1, 3], overall: [130, 126] },
  { days: 5, m1: [1, 4], overall: [60, 140] },
  { days: 30, m1: [1, 4], overall: [60, 140] },
  { days: 10, m1: [1, 1], overall: [90, 95] },
  { days: 21, m1: [1, 0], overall: [140, 135] },
  { days: 22, m1: [0, 4], overall: [60, 140] },
  { days: 9, m1: [0, 4], overall: [60, 140] },
];

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

async function build(db: Db): Promise<void> {
  // Group A.
  const aB1: Array<number | 'skip' | 'none'> = [3, 3, 3, 3, 3, 4, 1, 'skip', 'skip', 'none'];
  const aB4 = [6, 0, 1, 2, 3];
  const aB3Seconds = [1, 2, 9];
  for (let i = 0; i < 10; i++) {
    const user = `a${i + 1}`;
    const session = `sa${i + 1}`;
    const at = '2026-02-20T10:00:00.000Z';
    await addUser(db, user, i === 9);
    await addSession(db, { id: session, user, role: 'emp', age: 2, created: at, completed: i < 9 ? '2026-02-20T10:10:00.000Z' : null });
    await addQuestion(db, { session, user, seq: 0, item: 'B1', answer: aB1[i], seconds: i + 1, at });
    if (i < 5) await addQuestion(db, { session, user, seq: 1, item: 'B4', answer: aB4[i], seconds: 2, at });
    if (i < 3) await addQuestion(db, { session, user, seq: 2, item: 'B3', answer: 3, seconds: aB3Seconds[i], at });
    if (i < 3) await addQuestion(db, { session, user, seq: 3, item: 'N2', answer: 2, seconds: 3, at });
    if (i === 1) {
      // a2 has only a result of an older algorithm version: it is used, since there is no other.
      await addResult(db, { session, user, overall: A_PRICES[i], c: A_PRICES[i], algo: 0, computedAt: at });
    } else if (i < 9) {
      await addResult(db, { session, user, overall: A_PRICES[i], c: A_PRICES[i], computedAt: at });
    }
  }
  // a1 also has a newer row of another algorithm version: the current version still wins.
  await addResult(db, { session: 'sa1', user: 'a1', overall: 55, c: 55, algo: 0, computedAt: '2026-02-27T00:00:00.000Z' });

  // Group U.
  const uB1: Array<number | 'skip' | 'none'> = [3, 3, 3, 3, 3, 4, 2, 2, 'skip', 'none'];
  for (let i = 0; i < 10; i++) {
    const user = `u${i + 1}`;
    const session = `su${i + 1}`;
    const recent = i === 9;
    const created = recent ? '2026-02-28T11:54:00.000Z' : '2026-02-20T11:00:00.000Z';
    await addUser(db, user);
    await addSession(db, { id: session, user, role: 'ug4', age: 0, created, completed: recent ? null : '2026-02-20T11:10:00.000Z' });
    await addQuestion(db, {
      session, user, seq: 0, item: 'B1', answer: uB1[i], seconds: i + 8,
      at: recent ? '2026-02-28T11:55:00.000Z' : created,
    });
    if (i < 9) await addResult(db, { session, user, overall: U_PRICES[i], c: U_PRICES[i], m: i < 3 ? 90 : undefined, computedAt: created });
  }

  // Group R.
  const first = '2026-01-10T15:00:00.000Z';
  for (let i = 0; i < 10; i++) {
    const user = `r${i + 1}`;
    const r = R[i];
    await addUser(db, user);
    let second = plusDays(first, r.days);
    // The window counts calendar days (UTC), not 24-hour periods.
    if (r.days === 10) second = '2026-01-20T00:30:00.000Z';
    if (r.days === 9) second = '2026-01-19T23:30:00.000Z';
    const checks = [
      { id: `sr${i + 1}a`, at: first, m1: r.m1[0], overall: r.overall[0] },
      { id: `sr${i + 1}b`, at: second, m1: r.m1[1], overall: r.overall[1] },
    ];
    if (i === 0) checks.push({ id: 'sr1c', at: plusDays(first, 28), m1: 4, overall: 70 });
    for (const c of checks) {
      await addSession(db, { id: c.id, user, role: 'emp', age: 3, created: c.at, completed: c.at });
      await addQuestion(db, { session: c.id, user, seq: 0, item: 'M1', answer: c.m1, seconds: 5, at: c.at });
      await addResult(db, { session: c.id, user, overall: c.overall, c: c.overall, computedAt: c.at });
    }
  }

  // Visits. Day 0 of group R is 2026-01-10; of groups A and U it is 2026-02-20.
  for (const u of ['r1', 'r2', 'r3', 'r4']) await addVisit(db, u, '2026-01-11'); // day 1
  for (const u of ['r1', 'r2']) await addVisit(db, u, '2026-01-17'); // day 7
  await addVisit(db, 'r1', '2026-02-09'); // day 30
  await addVisit(db, 'r5', '2026-01-12'); // day 2: counts for nothing
  for (const u of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) await addVisit(db, u, '2026-02-21'); // day 1
  await addVisit(db, 'a1', '2026-02-27'); // day 7, which is not over yet
  await addVisit(db, 'u10', '2026-02-28'); // never completed a check: in no cohort

  // Report events.
  const t = '2026-02-20T10:11:00.000Z';
  await addReportEvent(db, { id: 'e1', user: 'a1', session: 'sa1', section: 'chart', kind: 'seen', at: t });
  await addReportEvent(db, { id: 'e2', user: 'a1', session: 'sa1', section: 'chart', kind: 'seen', at: t });
  await addReportEvent(db, { id: 'e3', user: 'a2', session: 'sa2', section: 'chart', kind: 'seen', at: t });
  await addReportEvent(db, { id: 'e4', user: 'a1', session: 'sa1', section: 'chart', kind: 'dwell', ms: 1000, at: t });
  await addReportEvent(db, { id: 'e5', user: 'a1', session: 'sa1', section: 'chart', kind: 'dwell', ms: 8000, at: t });
  await addReportEvent(db, { id: 'e6', user: 'a2', session: 'sa2', section: 'chart', kind: 'dwell', ms: 3000, at: t });
  await addReportEvent(db, { id: 'e7', user: 'a1', session: 'sa1', section: 'chart', kind: 'useful', useful: false, at: t });
  await addReportEvent(db, { id: 'e8', user: 'a1', session: 'sa1', section: 'chart', kind: 'useful', useful: true, at: '2026-02-20T10:12:00.000Z' });
  await addReportEvent(db, { id: 'e9', user: 'a2', session: 'sa2', section: 'chart', kind: 'useful', useful: false, at: t });
  await addReportEvent(db, { id: 'e10', user: 'a1', session: 'sa1', section: 'share', kind: 'share', at: t });
  await addReportEvent(db, { id: 'e11', user: 'u1', session: 'su1', section: 'share', kind: 'share', at: t });
}

// ---------------------------------------------------------------- independent arithmetic for the expectations

function medianOf(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const meanOf = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
function sampleSd(values: number[]): number {
  const m = meanOf(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

/** Latest sector C price of each person in group R, in the order r1..r10. */
const R_LATEST = [70, 108, 124, 126, 140, 140, 95, 135, 140, 140];

// ---------------------------------------------------------------- the tests

let api: TestApi;
const get = (path: string) => api.call('GET', path, { token: TEAM_PASSPHRASE });

beforeAll(async () => {
  api = await makeApi({ now: NOW });
  await build(api.db);
});

describe('overview', () => {
  it('started, completed and completion rate, with counts', async () => {
    const { body } = await get('/api/team/overview');
    // Checks: 10 + 10 + 21 started; 9 + 9 + 21 completed. People: 30 started, 28 completed.
    expect(body.totals).toEqual({
      sessions: { count: 39, of: 41, rate: 39 / 41 },
      people: { count: 28, of: 30, rate: 28 / 30 },
    });
    expect(body.demoPeople).toBe(1);
    expect(body.versions).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
  });

  it('counts by role', async () => {
    const { body } = await get('/api/team/overview');
    expect(body.byRole).toEqual([
      { role: 'ug4', sessions: { count: 9, of: 10, rate: 0.9 }, people: { count: 9, of: 10, rate: 0.9 } },
      { role: 'emp', sessions: { count: 30, of: 31, rate: 30 / 31 }, people: { count: 19, of: 20, rate: 0.95 } },
    ]);
  });

  it('retest correlation of the overall price over the six pairs 10 to 21 days apart', async () => {
    const { body } = await get('/api/team/overview');
    // Pairs (first, second): (100,102) (110,108) (120,124) (130,126) (90,95) (140,135).
    // Both means are 115. Deviations: [-15,-5,5,15,-25,25] and [-13,-7,9,11,-20,20].
    // Sum of products 1440, sums of squares 1750 and 1220, so r = 1440 / sqrt(1750 * 1220) = 0.98551...
    expect(body.retest.pairs).toBe(6);
    expect(body.retest.correlation).toBeCloseTo(1440 / Math.sqrt(1750 * 1220), 10);
    expect(body.retest.correlation).toBeCloseTo(0.98551, 4);
    expect(body.retest.windowDays).toEqual({ min: 10, max: 21 });
  });

  it('go criteria from config, with the current value of each', async () => {
    const { body } = await get('/api/team/overview');
    expect(body.goCriteria).toEqual({ ...GO_CRITERIA });
    expect(body.goCriteria).toEqual({
      completionRate: 0.7,
      maxItemSkipRate: 0.1,
      retestCorrelation: 0.75,
      dailyOpenDay7Return: 0.25,
      dailyOpenDay30Return: 0.12,
      paydayCompletionShare: 0.5,
    });
    expect(body.redLines).toEqual({ ...DASHBOARD_RED_LINES });
    // 28 of 30 people completed: above 70%.
    expect(body.status.completionRate).toEqual({ count: 28, of: 30, rate: 28 / 30, met: true });
    // B1 was skipped by 3 of the 20 who saw it: above the 10% allowed.
    expect(body.status.maxItemSkipRate).toEqual({ value: 0.15, itemId: 'B1', versionKey: 'base', met: false });
    expect(body.status.retestCorrelation.met).toBe(true);
    expect(body.status.retestCorrelation.pairs).toBe(6);
  });
});

describe('per question, all roles', () => {
  let rows: Record<string, TeamItemRow>;
  let order: string[];
  beforeAll(async () => {
    const { body } = await get('/api/team/items');
    order = body.rows.map((r: TeamItemRow) => `${r.itemId}:${r.versionKey}`);
    rows = Object.fromEntries(body.rows.map((r: TeamItemRow) => [r.itemId, r]));
    expect(body.role).toBeNull();
    expect(body.bankVersion).toBe('2.1');
    expect(body.definitions).toEqual({
      similarStemBand: 1.5,
      minSimilarStems: 3,
      dropOffIdleMinutes: 30,
      retestWindowDays: { min: 10, max: 21 },
    });
  });

  it('lists one row per version that was shown, in questionnaire order', () => {
    expect(order).toEqual(['N2:base', 'B1:base', 'B3:base', 'B4:base', 'M1:base']);
    expect(rows.B1.area).toBe('B');
    expect(rows.N2.area).toBe('N');
  });

  it('skip rate: of those shown; red above 10%', () => {
    // B1: shown to 20, skipped by a8, a9 and u9.
    expect(rows.B1.shown).toBe(20);
    expect(rows.B1.skip).toEqual({ count: 3, of: 20, rate: 0.15, red: true });
    expect(rows.B4.skip).toEqual({ count: 0, of: 5, rate: 0, red: false });
    expect(rows.M1.skip).toEqual({ count: 0, of: 21, rate: 0, red: false });
  });

  it('drop-off rate: shown, nothing after it; red above 3%', () => {
    // Only a10 left at B1. u10 is still inside the 30 idle minutes.
    expect(rows.B1.dropOff).toEqual({ count: 1, of: 20, rate: 0.05, red: true });
    expect(rows.B3.dropOff).toEqual({ count: 0, of: 3, rate: 0, red: false });
  });

  it('median seconds, and red when above twice the median of stems of similar length', () => {
    // Medians: B1 8 (1..15), B4 2, B3 2 (1,2,9), N2 3, M1 5.
    expect(rows.B1.time.medianSeconds).toBe(8);
    expect(rows.B4.time.medianSeconds).toBe(2);
    expect(rows.B3.time.medianSeconds).toBe(2);
    expect(rows.N2.time.medianSeconds).toBe(3);
    expect(rows.M1.time.medianSeconds).toBe(5);
    // English stems: B1 9 words, B4 12, B3 14, N2 15, M1 17. At 1,400 words a minute.
    expect(rows.B1.time.stemSeconds).toBeCloseTo((9 * 60) / 1400, 12);
    expect(rows.M1.time.stemSeconds).toBeCloseTo((17 * 60) / 1400, 12);
    expect(rows.B1.time.stemLang).toBe('en');
    // "Similar" is within a factor of 1.5:
    //   B1 (9):  only B4 (12).                 Fewer than 3, so no comparison.
    //   B4 (12): B1, B3, N2, M1 -> medians [8,2,3,5], median 4.   2 > 8?  no.
    //   B3 (14): B4, N2, M1     -> [2,3,5], median 3.             2 > 6?  no.
    //   N2 (15): B4, B3, M1     -> [2,2,5], median 2.             3 > 4?  no.
    //   M1 (17): B4, B3, N2     -> [2,2,3], median 2.             5 > 4?  yes, red.
    expect(rows.B1.time).toMatchObject({ similarCount: 1, similarMedianSeconds: null, red: false });
    expect(rows.B4.time).toMatchObject({ similarCount: 4, similarMedianSeconds: 4, red: false });
    expect(rows.B3.time).toMatchObject({ similarCount: 3, similarMedianSeconds: 3, red: false });
    expect(rows.N2.time).toMatchObject({ similarCount: 3, similarMedianSeconds: 2, red: false });
    expect(rows.M1.time).toMatchObject({ similarCount: 3, similarMedianSeconds: 2, red: true });
  });

  it('option distribution; red when one option is above 60% or any is below 3%', () => {
    // B1: 15 selections. Option 3 has 10 of 15 (67%), option 0 has none.
    expect(rows.B1.answered).toBe(15);
    expect(rows.B1.options.counts).toEqual([0, 1, 2, 10, 2]);
    expect(rows.B1.options.shares).toEqual([0, 1 / 15, 2 / 15, 10 / 15, 2 / 15]);
    expect(rows.B1.options.red).toBe(true);
    // M1: 21 selections, [3, 11, 1, 1, 5]. Largest 52%, smallest 4.8%: inside both lines.
    expect(rows.M1.options.counts).toEqual([3, 11, 1, 1, 5]);
    expect(rows.M1.options.red).toBe(false);
    // B3: everyone chose option 3.
    expect(rows.B3.options.counts).toEqual([0, 0, 0, 3, 0]);
    expect(rows.B3.options.red).toBe(true);
  });

  it('not-applicable share: options whose score is null; red above 15%', () => {
    // B4: 1 of 5 chose option 6, the one without a score.
    expect(rows.B4.options.counts).toEqual([1, 1, 1, 1, 0, 0, 1]);
    expect(rows.B4.notApplicable).toEqual({ count: 1, of: 5, rate: 0.2, red: true, hasOption: true });
    expect(rows.B1.notApplicable).toEqual({ count: 0, of: 15, rate: 0, red: false, hasOption: false });
  });

  it('retest change: same person, two checks 10 to 21 days apart; red above 30%', () => {
    // M1 pairs: r1 1->1, r2 1->1, r3 1->2, r4 1->3, r7 1->1, r8 1->0. Three of six changed.
    // r5 (5 days), r6 (30), r9 (22) and r10 (9) all changed their answer and are outside the window.
    // r1's third check pairs with the second, but only a person's earliest pair counts.
    expect(rows.M1.retest).toEqual({ count: 3, of: 6, rate: 0.5, red: true });
    expect(rows.B1.retest).toEqual({ count: 0, of: 0, rate: null, red: false });
  });
});

describe('per question, filtered by role', () => {
  it('role=emp', async () => {
    const { body } = await get('/api/team/items?role=emp');
    const rows: Record<string, TeamItemRow> = Object.fromEntries(body.rows.map((r: TeamItemRow) => [r.itemId, r]));
    expect(body.role).toBe('emp');
    expect(Object.keys(rows).sort()).toEqual(['B1', 'B3', 'B4', 'M1', 'N2']);
    // Group A only: shown 10, skipped 2, a10 dropped, 7 selections [3,3,3,3,3,4,1] in 1..7 seconds.
    expect(rows.B1.shown).toBe(10);
    expect(rows.B1.skip).toEqual({ count: 2, of: 10, rate: 0.2, red: true });
    expect(rows.B1.dropOff).toEqual({ count: 1, of: 10, rate: 0.1, red: true });
    expect(rows.B1.options.counts).toEqual([0, 1, 0, 5, 1]);
    expect(rows.B1.time.medianSeconds).toBe(4);
    expect(rows.M1.retest).toEqual({ count: 3, of: 6, rate: 0.5, red: true });
    expect(rows.M1.time.red).toBe(true);
  });

  it('role=ug4', async () => {
    const { body } = await get('/api/team/items?role=ug4');
    expect(body.rows.length).toBe(1);
    const b1: TeamItemRow = body.rows[0];
    // Group U only: shown 10, u9 skipped (exactly 10%: on the line, not above it), 8 selections.
    expect(b1.itemId).toBe('B1');
    expect(b1.shown).toBe(10);
    expect(b1.skip).toEqual({ count: 1, of: 10, rate: 0.1, red: false });
    expect(b1.dropOff).toEqual({ count: 0, of: 10, rate: 0, red: false });
    expect(b1.options.counts).toEqual([0, 0, 2, 5, 1]);
    // Seconds 8..15: median 11.5.
    expect(b1.time.medianSeconds).toBe(11.5);
    expect(b1.time.similarCount).toBe(0);
    expect(b1.retest.of).toBe(0);
  });

  it('a person who stays away becomes a drop-off after the idle time', async () => {
    api.setNow('2026-02-28T12:30:00.000Z');
    const { body } = await get('/api/team/items?role=ug4');
    api.setNow(NOW);
    // u10 saw B1 at 11:55. At 12:30 that is 35 minutes ago.
    expect(body.rows[0].dropOff).toEqual({ count: 1, of: 10, rate: 0.1, red: true });
  });
});

describe('sector prices by role and age band', () => {
  let rows: TeamPriceRow[];
  const find = (role: string | null, age: number | null, area: string) =>
    rows.find((r) => r.role === role && r.age === age && r.area === area);

  beforeAll(async () => {
    const { body } = await get('/api/team/prices');
    rows = body.rows;
    expect(body.binEdges).toEqual([55, 70, 85, 100, 115, 130, 145]);
  });

  it('one row per cohort and sector that has people: 9 for C and 4 for M', () => {
    expect(rows.length).toBe(13);
    expect(rows.filter((r) => r.area === 'C').length).toBe(9);
    expect(rows.filter((r) => r.area === 'M').length).toBe(4);
    expect(rows[0]).toMatchObject({ role: null, age: null, area: 'C' });
  });

  it('each person counts once, with their latest check and the current-version result', () => {
    // emp, age band 2 (group A): [70, 85, 100, 100, 100, 115, 115, 130, 137.5].
    // a1's stray row of another algorithm version (55) is not used; a2's only row (85) is.
    expect(find('emp', 2, 'C')).toEqual({
      role: 'emp', age: 2, area: 'C', n: 9, median: 100, min: 70, max: 137.5, bins: [0, 1, 1, 3, 2, 2],
    });
    // emp, age band 3 (group R, latest checks): [70, 108, 124, 126, 140, 140, 95, 135, 140, 140].
    // Sorted: 70 95 108 124 126 | 135 140 140 140 140, median (126 + 135) / 2.
    expect(find('emp', 3, 'C')).toEqual({
      role: 'emp', age: 3, area: 'C', n: 10, median: 130.5, min: 70, max: 140, bins: [0, 1, 1, 1, 2, 5],
    });
    expect(find('ug4', 0, 'C')).toEqual({
      role: 'ug4', age: 0, area: 'C', n: 9, median: 100, min: 85, max: 115, bins: [0, 0, 3, 3, 3, 0],
    });
  });

  it('rolls up by role, by age band and overall', () => {
    // All 19 emp: 70 70 85 95 100 100 100 108 115 [115] 124 126 130 135 137.5 140 140 140 140.
    expect(find('emp', null, 'C')).toEqual({
      role: 'emp', age: null, area: 'C', n: 19, median: 115, min: 70, max: 140, bins: [0, 2, 2, 4, 4, 7],
    });
    expect(find(null, 2, 'C')).toMatchObject({ n: 9, median: 100, bins: [0, 1, 1, 3, 2, 2] });
    expect(find(null, 3, 'C')).toMatchObject({ n: 10, median: 130.5 });
    expect(find(null, 0, 'C')).toMatchObject({ n: 9, median: 100 });
    expect(find('ug4', null, 'C')).toMatchObject({ n: 9, median: 100 });
    // All 28: the 14th and 15th values are 108 and 115.
    expect(find(null, null, 'C')).toEqual({
      role: null, age: null, area: 'C', n: 28, median: 111.5, min: 70, max: 140, bins: [0, 2, 5, 7, 7, 7],
    });
    // The expectations above agree with plain arithmetic on the listed values.
    expect(medianOf([...A_PRICES, ...R_LATEST])).toBe(115);
    expect(medianOf([...A_PRICES, ...R_LATEST, ...U_PRICES])).toBe(111.5);
  });

  it('a sector counts only the people who have a price in it', () => {
    // Only u1..u3 have a mind price (90).
    for (const [role, age] of [['ug4', 0], ['ug4', null], [null, 0], [null, null]] as const) {
      expect(find(role, age, 'M')).toEqual({ role, age, area: 'M', n: 3, median: 90, min: 90, max: 90, bins: [0, 0, 3, 0, 0, 0] });
    }
    expect(find('emp', null, 'M')).toBeUndefined();
    expect(rows.some((r) => r.area === 'W' || r.area === 'N' || r.area === 'B')).toBe(false);
  });
});

describe('actual median, standard deviation and n of the internal sector values', () => {
  let rows: TeamNormRow[];
  let current: any;
  const find = (role: string | null, age: number | null, area: string) =>
    rows.find((r) => r.role === role && r.age === age && r.area === area) as TeamNormRow;

  beforeAll(async () => {
    const { body } = await get('/api/team/norms');
    rows = body.rows;
    current = body.current;
  });

  it('shows the norm in force next to the real values', () => {
    expect(current.version).toBe('provisional-1');
    expect(current.provisional).toBe(true);
    expect(current.sectors.C).toEqual({ median: 0.5, sd: 0.2 });
    expect(rows.length).toBe(13);
  });

  it('emp, age band 2', () => {
    // Values: [0.1, 0.3, 0.5, 0.5, 0.5, 0.7, 0.7, 0.9, 1.0]. Sum 5.2, sum of squares 3.64.
    // Median 0.5, mean 5.2 / 9, sample sd sqrt((3.64 - 5.2^2 / 9) / 8) = 0.28186...
    const row = find('emp', 2, 'C');
    expect(row.n).toBe(9);
    expect(row.median).toBeCloseTo(0.5, 12);
    expect(row.mean).toBeCloseTo(5.2 / 9, 12);
    expect(row.sd).toBeCloseTo(Math.sqrt((3.64 - 5.2 ** 2 / 9) / 8), 12);
    expect(row.sd).toBeCloseTo(0.28186, 4);
  });

  it('ug4, age band 0', () => {
    // Values: 0.3 three times, 0.5 three times, 0.7 three times. Mean 0.5, sample sd sqrt(0.24 / 8).
    const row = find('ug4', 0, 'C');
    expect(row.n).toBe(9);
    expect(row.median).toBeCloseTo(0.5, 12);
    expect(row.mean).toBeCloseTo(0.5, 12);
    expect(row.sd).toBeCloseTo(Math.sqrt(0.03), 12);
  });

  it('the other cohorts, against plain arithmetic on the listed values', () => {
    const cases: Array<[string | null, number | null, number[]]> = [
      ['emp', 3, R_LATEST],
      ['emp', null, [...A_PRICES, ...R_LATEST]],
      [null, null, [...A_PRICES, ...R_LATEST, ...U_PRICES]],
    ];
    for (const [role, age, prices] of cases) {
      const values = prices.map(rawOf);
      const row = find(role, age, 'C');
      expect(row.n).toBe(values.length);
      expect(row.median).toBeCloseTo(medianOf(values), 12);
      expect(row.mean).toBeCloseTo(meanOf(values), 12);
      expect(row.sd).toBeCloseTo(sampleSd(values), 12);
    }
    // Three people with the same value: the spread is zero.
    expect(find('ug4', 0, 'M').n).toBe(3);
    expect(find('ug4', 0, 'M').sd).toBeCloseTo(0, 12);
    expect(find('ug4', 0, 'M').median).toBeCloseTo(rawOf(90), 12);
  });
});

describe('return rates by the date of the first check', () => {
  it('day 1, 7 and 30, counted only once the day is over', async () => {
    const { body } = await get('/api/team/returns');
    expect(body.returnDays).toEqual([1, 7, 30]);
    expect(body.rows).toEqual([
      {
        firstDay: 'all',
        people: 28,
        returns: [
          { day: 1, count: 10, of: 28, rate: 10 / 28 },
          { day: 7, count: 2, of: 10, rate: 0.2 },
          { day: 30, count: 1, of: 10, rate: 0.1 },
        ],
      },
      {
        // Group R. r1..r4 came back on day 1, r1 and r2 on day 7, r1 on day 30.
        firstDay: '2026-01-10',
        people: 10,
        returns: [
          { day: 1, count: 4, of: 10, rate: 0.4 },
          { day: 7, count: 2, of: 10, rate: 0.2 },
          { day: 30, count: 1, of: 10, rate: 0.1 },
        ],
      },
      {
        // Groups A and U: 18 people completed a first check. Six came back on day 1.
        // Day 7 is 2026-02-27, which is not over everywhere yet on 2026-02-28, so nobody is
        // counted for it, not even a1 who did come back that day.
        firstDay: '2026-02-20',
        people: 18,
        returns: [
          { day: 1, count: 6, of: 18, rate: 6 / 18 },
          { day: 7, count: 0, of: 0, rate: null },
          { day: 30, count: 0, of: 0, rate: null },
        ],
      },
    ]);
  });
});

describe('how the result page is read', () => {
  it('seen, dwell, shares and the useful click per section', async () => {
    const { body } = await get('/api/team/report');
    expect(body.rows.map((r: any) => r.section)).toEqual([...REPORT_SECTIONS]);
    const chart = body.rows.find((r: any) => r.section === 'chart');
    // Seen on two result pages (a1 twice counts once). Dwell 1000, 3000, 8000 ms.
    // a1 first said "not useful" and then "useful": the last click counts.
    expect(chart).toEqual({ section: 'chart', seen: 2, medianDwellMs: 3000, dwellEvents: 3, shares: 0, useful: 1, notUseful: 1 });
    const share = body.rows.find((r: any) => r.section === 'share');
    expect(share).toEqual({ section: 'share', seen: 0, medianDwellMs: null, dwellEvents: 0, shares: 2, useful: 0, notUseful: 0 });
    const radar = body.rows.find((r: any) => r.section === 'radar');
    expect(radar).toEqual({ section: 'radar', seen: 0, medianDwellMs: null, dwellEvents: 0, shares: 0, useful: 0, notUseful: 0 });
  });
});

describe('CSV', () => {
  const lines = (text: string) => text.trimEnd().split('\r\n');

  it('every table is also served as CSV', async () => {
    for (const table of ['overview', 'items', 'prices', 'norms', 'returns', 'report']) {
      const res = await get(`/api/team/${table}?format=csv`);
      expect(res.status, table).toBe(200);
      expect(res.headers.get('content-type'), table).toBe('text/csv; charset=utf-8');
      expect(res.headers.get('content-disposition'), table).toMatch(/^attachment; filename="standing-[a-z-]+\.csv"$/);
      expect(lines(res.text).length, table).toBeGreaterThan(1);
    }
  });

  it('the question table carries counts next to every rate', async () => {
    const res = await get('/api/team/items?format=csv');
    const rows = lines(res.text);
    expect(rows[0]).toBe(
      'item_id,version_key,area,shown,skipped,skip_rate,skip_red,dropped,drop_off_rate,drop_off_red,answered,' +
        'median_seconds,stem_seconds,similar_stems,similar_median_seconds,time_red,option_counts,option_shares,options_red,' +
        'not_applicable,not_applicable_rate,not_applicable_red,retest_people,retest_changed,retest_change_rate,retest_red',
    );
    expect(rows.length).toBe(6);
    const b1 = rows.find((r) => r.startsWith('B1,'))!.split(',');
    expect(b1.slice(0, 11)).toEqual(['B1', 'base', 'B', '20', '3', '0.15', 'true', '1', '0.05', 'true', '15']);
    expect(b1[16]).toBe('0|1|2|10|2');
    const m1 = rows.find((r) => r.startsWith('M1,'))!.split(',');
    expect(m1.slice(-4)).toEqual(['6', '3', '0.5', 'true']);
  });

  it('overview, go criteria, prices, norms and returns', async () => {
    const overview = lines((await get('/api/team/overview?format=csv')).text);
    expect(overview).toEqual([
      'role,checks_started,checks_completed,check_completion_rate,people_started,people_completed,people_completion_rate',
      `all,41,39,${39 / 41},30,28,${28 / 30}`,
      'ug4,10,9,0.9,10,9,0.9',
      `emp,31,30,${30 / 31},20,19,0.95`,
    ]);
    const status = lines((await get('/api/team/overview?format=csv&table=status')).text);
    expect(status[0]).toBe('metric,value,count,of,criterion,met');
    expect(status[1]).toBe(`completion_rate_people,${28 / 30},28,30,0.7,true`);
    expect(status[2]).toBe('max_item_skip_rate,0.15,,,0.1,false');
    expect(status[3].startsWith('retest_correlation,0.9855')).toBe(true);

    const prices = lines((await get('/api/team/prices?format=csv')).text);
    expect(prices[0]).toBe(
      'role,age_band,sector,people,median_price,min_price,max_price,price_55_to_70,price_70_to_85,price_85_to_100,price_100_to_115,price_115_to_130,price_130_to_145',
    );
    expect(prices.length).toBe(14);
    expect(prices[1]).toBe('all,all,C,28,111.5,70,140,0,2,5,7,7,7');
    expect(prices).toContain('emp,2,C,9,100,70,137.5,0,1,1,3,2,2');

    const norms = lines((await get('/api/team/norms?format=csv')).text);
    expect(norms[0]).toBe('role,age_band,sector,people,median_value,mean_value,sd_value,norm_version,norm_median,norm_sd');
    expect(norms.length).toBe(14);
    expect(norms.find((l) => l.startsWith('ug4,0,M,'))!.endsWith(',provisional-1,0.5,0.2')).toBe(true);

    const returns = lines((await get('/api/team/returns?format=csv')).text);
    expect(returns).toEqual([
      'first_day,people,day1_eligible,day1_returned,day1_rate,day7_eligible,day7_returned,day7_rate,day30_eligible,day30_returned,day30_rate',
      `all,28,28,10,${10 / 28},10,2,0.2,10,1,0.1`,
      '2026-01-10,10,10,4,0.4,10,2,0.2,10,1,0.1',
      `2026-02-20,18,18,6,${6 / 18},0,0,,0,0,`,
    ]);
  });
});

describe('aggregates only', () => {
  it('no response names a person or a check', async () => {
    const ids = [
      ...Array.from({ length: 10 }, (_, i) => [`"a${i + 1}"`, `"u${i + 1}"`, `"r${i + 1}"`, `sa${i + 1}`, `su${i + 1}`, `sr${i + 1}a`]).flat(),
      'hash-of-',
    ];
    for (const table of ['overview', 'items', 'prices', 'norms', 'returns', 'report']) {
      for (const format of ['json', 'csv']) {
        const res = await get(`/api/team/${table}?format=${format}`);
        expect(res.status).toBe(200);
        for (const id of ids) expect(res.text.includes(id), `${table} ${format} ${id}`).toBe(false);
      }
    }
  });

  it('writes nothing', async () => {
    const before = await api.db.query('select (select count(*) from users)::int as u, (select count(*) from question_events)::int as e');
    for (const table of ['overview', 'items', 'prices', 'norms', 'returns', 'report']) await get(`/api/team/${table}`);
    const after = await api.db.query('select (select count(*) from users)::int as u, (select count(*) from question_events)::int as e');
    expect(after).toEqual(before);
    expect(before).toEqual([{ u: 30, e: 102 }]);
  });
});
