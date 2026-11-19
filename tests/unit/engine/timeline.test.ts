// The day-by-day series: the 2 point daily limit and its carry-over, the uncapped day of a full
// check, halts and resumption for each sector, the retake prompt, markers, and the cost of a
// year of history.

import { describe, expect, it } from 'vitest';
import {
  ALGO_PARAMS,
  AREA_IDS,
  CURRENT,
  addDays,
  compute,
  createAlgoV1,
  createTestVariantAlgo,
  registerAlgo,
  timeline,
  timelineInputOn,
} from '../../../src/engine';
import type { AreaId, DailyEntry, PaydayBands, PeopleNudgeEntry, Step, TimelinePoint, WeeklyWinEntry } from '../../../src/engine';
import { backgroundFor, bank, bestOption, chooseBest, walk, withAnswer } from './helpers';

// 2026-03-02 is a Monday.
const D = '2026-03-02';
const day = (n: number): string => addDays(D, n);
const emp = backgroundFor('emp');
const middle = walk(emp, () => 2);
const check = { day: D, background: emp, steps: middle };
const LIMIT = ALGO_PARAMS[1].dailyMoveLimitPoints;

/** Days of "7 to 9" hours and 60 minutes or more, no state tap: only body answers are replaced. */
const active = (offsets: number[]): DailyEntry[] => offsets.map((n) => ({ day: day(n), sleep: 3, exercise: 4, state: null }));
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const priceOf = (points: TimelinePoint[], area: AreaId): Array<number | null> => points.map((p) => p.sectors[area].price);
const statusOf = (points: TimelinePoint[], area: AreaId): string[] => points.map((p) => p.sectors[area].status);

const base = compute({ bank, background: emp, steps: middle });
const replaced = compute({
  bank,
  background: emp,
  steps: middle,
  overrides: [
    { itemId: 'B3', k: 3, source: 'daily_open' },
    { itemId: 'B2', k: 4, source: 'daily_open' },
  ],
});
const LOW = base.sectors.B.price as number;
const HIGH = replaced.sectors.B.price as number;

describe('the series', () => {
  it('has one point per day from the first full check to the given day', () => {
    const series = timeline({ checks: [check], until: day(9) });
    expect(series.points.map((p) => p.day)).toEqual(range(0, 9).map(day));
    expect(series.points[0].fullCheck).toBe(true);
    expect(series.markers).toEqual([{ day: D, kind: 'full_check' }]);
    expect(series.versions).toEqual(CURRENT);
    for (const p of series.points) {
      for (const a of AREA_IDS) expect(p.sectors[a]).toEqual({ status: 'listed', target: base.sectors[a].price, price: base.sectors[a].price });
      expect(p.overall).toBe(base.overall);
      expect(p.overallCovers).toEqual(base.overallCovers);
    }
  });

  it('is empty before the first check, and without one', () => {
    expect(timeline({ checks: [check], until: day(-1) })).toEqual({ points: [], markers: [], versions: null, halted: [], retake: null });
    expect(timeline({ checks: [], daily: active([1, 2, 3, 4]), until: day(9) }).points).toEqual([]);
  });

  it('gives the same output for the same input, and does not depend on the order of the records', () => {
    const daily = active(range(1, 10));
    const one = timeline({ checks: [check], daily, until: day(30) });
    expect(timeline({ checks: [check], daily: [...daily].reverse(), until: day(30) })).toEqual(one);
    expect(JSON.parse(JSON.stringify(one))).toEqual(one);
  });
});

describe('a sector moves at most 2 points a day and carries the rest over', () => {
  const series = timeline({ checks: [check], daily: active(range(1, 10)), until: day(19) });
  const body = series.points.map((p) => p.sectors.B);

  it('the target jumps on the fourth day of data, the shown price follows 2 points a day', () => {
    expect(LIMIT).toBe(2);
    // B3 from "6 to 7" to "7 to 9" and B2 from "90 to 149" to "300 or more": 8.75 points.
    expect(HIGH - LOW).toBeCloseTo(8.75, 9);
    expect(body.slice(0, 4).map((s) => s.target)).toEqual([LOW, LOW, LOW, LOW]);
    expect(body.slice(4, 14).every((s) => s.target === HIGH)).toBe(true);
    expect(body[3].price).toBe(LOW);
    expect(body[4].price).toBeCloseTo(LOW + 2, 12);
    expect(body[5].price).toBeCloseTo(LOW + 4, 12);
    expect(body[6].price).toBeCloseTo(LOW + 6, 12);
    expect(body[7].price).toBeCloseTo(LOW + 8, 12);
    // The remaining 0.75 points on the fifth day, landing exactly on the target.
    expect(body[8].price).toBe(HIGH);
    expect(body[9].price).toBe(HIGH);
  });

  it('a move within the limit is made at once', () => {
    // Mind moves through the loads of the two body questions, by less than 2 points.
    const mind = series.points.map((p) => p.sectors.M);
    const step = (mind[4].target as number) - (mind[3].target as number);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(LIMIT);
    expect(mind[4].price).toBe(mind[4].target);
  });

  it('the same holds on the way down, when the data lapses', () => {
    // Day 14: the window (days 8 to 14) holds three days, so the questionnaire answers are back.
    expect(body[13].target).toBe(HIGH);
    expect(body[14].target).toBe(LOW);
    expect(body[14].price).toBeCloseTo(HIGH - 2, 12);
    expect(body[17].price).toBeCloseTo(HIGH - 8, 12);
    expect(body[18].price).toBe(LOW);
    for (let i = 1; i < body.length; i++) {
      expect(Math.abs((body[i].price as number) - (body[i - 1].price as number))).toBeLessThanOrEqual(LIMIT + 1e-12);
    }
  });

  it('the overall price is the mean of the shown prices', () => {
    for (const p of series.points) {
      const shown = AREA_IDS.reduce((sum, a) => sum + (p.sectors[a].price as number), 0) / 5;
      const target = AREA_IDS.reduce((sum, a) => sum + (p.sectors[a].target as number), 0) / 5;
      expect(p.overall).toBeCloseTo(shown, 12);
      expect(p.overallTarget).toBeCloseTo(target, 12);
    }
    expect(series.points[4].overall as number).toBeLessThan(series.points[4].overallTarget as number);
  });

  it('the day of a full check is not capped', () => {
    const best = walk(emp, chooseBest);
    const retaken = timeline({ checks: [check, { day: day(20), background: emp, steps: best }], until: day(21) });
    const before = retaken.points[19];
    const after = retaken.points[20];
    for (const a of AREA_IDS) {
      expect(after.sectors[a].price).toBeCloseTo(137.5, 9);
      expect((after.sectors[a].price as number) - (before.sectors[a].price as number)).toBeGreaterThan(30);
    }
    expect(after.fullCheck).toBe(true);
    expect(retaken.markers).toEqual([
      { day: D, kind: 'full_check' },
      { day: day(20), kind: 'full_check' },
    ]);
    // Of two checks stored for the same day, the last one is in force.
    const twice = timeline({ checks: [check, { day: D, background: emp, steps: best }], until: D });
    expect(twice.points[0].overall).toBeCloseTo(137.5, 9);
  });

  it('a sector that gets its first price shows it at once', () => {
    // Three of the five body questions skipped: no body price. Daily data fills two of them.
    const sparse = withAnswer(withAnswer(withAnswer(middle, 'B1', null), 'B2', null), 'B3', null);
    const series2 = timeline({ checks: [{ day: D, background: emp, steps: sparse }], daily: active(range(1, 4)), until: day(5) });
    expect(statusOf(series2.points, 'B')).toEqual(['insufficient', 'insufficient', 'insufficient', 'insufficient', 'listed', 'listed']);
    expect(series2.points[3].sectors.B).toEqual({ status: 'insufficient', target: null, price: null });
    expect(series2.points[3].overallCovers).toEqual(['C', 'W', 'N', 'M']);
    expect(series2.points[4].sectors.B.price).toBe(series2.points[4].sectors.B.target);
    expect(series2.points[4].overallCovers).toEqual(['C', 'W', 'N', 'B', 'M']);
  });
});

describe('halts', () => {
  it('body and mind are halted after 14 days without a daily entry, once the daily open was used', () => {
    expect(ALGO_PARAMS[1].dailyOpen.haltAfterDays).toBe(14);
    const series = timeline({ checks: [check], daily: active(range(1, 10)), until: day(26) });
    // The last entry is on day 10. Days 11 to 24 are 14 days without one.
    expect(statusOf(series.points, 'B').slice(20)).toEqual(['listed', 'listed', 'listed', 'listed', 'listed', 'halted', 'halted']);
    expect(statusOf(series.points, 'M')).toEqual(statusOf(series.points, 'B'));
    for (const a of ['C', 'W', 'N'] as const) expect(new Set(statusOf(series.points, a))).toEqual(new Set(['listed']));
    expect(series.halted).toEqual(['B', 'M']);
  });

  it('a sector whose micro app was never used is never halted', () => {
    const series = timeline({ checks: [check], until: day(120) });
    for (const a of AREA_IDS) expect(new Set(statusOf(series.points, a))).toEqual(new Set(['listed']));
    expect(series.halted).toEqual([]);
  });

  it('wealth after 45 days without a payday, capability and network after 28 days without an entry', () => {
    expect([ALGO_PARAMS[1].payday.haltAfterDays, ALGO_PARAMS[1].weeklyWin.haltAfterDays, ALGO_PARAMS[1].peopleNudge.haltAfterDays]).toEqual([45, 28, 28]);
    const paydays: PaydayBands[] = [{ day: day(14), periods: 1, saveShare: 2, runway: null, baselineDay: D }];
    const weeklyWins: WeeklyWinEntry[] = [{ day: day(2), kind: 'skill' }];
    const peopleNudges: PeopleNudgeEntry[] = [{ day: day(4), planned: 3, reached: ['friend'] }];
    const series = timeline({ checks: [check], paydays, weeklyWins, peopleNudges, until: day(80) });
    const firstHalt = (a: AreaId): number => statusOf(series.points, a).indexOf('halted');
    expect(firstHalt('W')).toBe(14 + 46);
    expect(firstHalt('C')).toBe(2 + 29);
    expect(firstHalt('N')).toBe(4 + 29);
    expect(firstHalt('B')).toBe(-1);
    expect(series.halted).toEqual(['C', 'W', 'N']);
    // A new entry resumes the sector that day.
    const resumed = timeline({
      checks: [check],
      paydays: [...paydays, { day: day(70), periods: 1, saveShare: 2, runway: null, baselineDay: D }],
      weeklyWins: [...weeklyWins, { day: day(50), kind: 'course', hours: 1 }],
      peopleNudges: [...peopleNudges, { day: day(60), planned: 3, reached: [] }],
      until: day(80),
    });
    expect(statusOf(resumed.points, 'W').slice(68, 72)).toEqual(['halted', 'halted', 'listed', 'listed']);
    expect(statusOf(resumed.points, 'C').slice(48, 52)).toEqual(['halted', 'halted', 'listed', 'listed']);
    expect(statusOf(resumed.points, 'N').slice(58, 62)).toEqual(['halted', 'halted', 'listed', 'listed']);
  });

  it('a halted sector holds its price, and resumes toward its target on the next entry', () => {
    // The same rules with a halt after 3 days, so the halt comes while the price is away from its target.
    const params = structuredClone(ALGO_PARAMS[1]);
    params.dailyOpen.haltAfterDays = 3;
    registerAlgo(createAlgoV1(7101, params));
    const daily = [...active(range(1, 10)), ...active([20])];
    const series = timeline({ checks: [check], daily, versions: { algo: 7101 }, until: day(25) });
    const body = series.points.map((p) => p.sectors.B);
    expect(body[13]).toEqual({ status: 'listed', target: HIGH, price: HIGH });
    // Days 14 to 19: the data has lapsed, the target is back at the questionnaire price, and
    // the sector is halted. The price stays where it was.
    for (const n of range(14, 19)) expect(body[n]).toEqual({ status: 'halted', target: LOW, price: HIGH });
    // Day 20: one entry. Resumed, and the price starts toward the target under the daily limit.
    expect(body[20].status).toBe('listed');
    expect(body[20].price).toBeCloseTo(HIGH - 2, 12);
    expect(body[21].price).toBeCloseTo(HIGH - 4, 12);
    expect(body[23].price).toBeCloseTo(HIGH - 8, 12);
    // Day 24 is the fourth day without an entry: halted again, 0.75 points short of the target.
    expect(body[24].status).toBe('halted');
    expect(body[24].price).toBeCloseTo(LOW + 0.75, 12);
    expect(body[25].price).toBe(body[24].price);
    // The overall price holds the halted price too.
    const p = series.points[16];
    expect(p.overall).toBeCloseTo(AREA_IDS.reduce((sum, a) => sum + (p.sectors[a].price as number), 0) / 5, 12);
    expect(p.overall as number).toBeGreaterThan(p.overallTarget as number);
  });

  it('a full check is fresh data: it ends a halt, and the 14 days count from it', () => {
    const series = timeline({ checks: [check, { day: day(40), background: emp, steps: middle }], daily: active(range(1, 10)), until: day(56) });
    expect(statusOf(series.points, 'B').slice(38, 42)).toEqual(['halted', 'halted', 'listed', 'listed']);
    expect(statusOf(series.points, 'B').slice(53, 57)).toEqual(['listed', 'listed', 'halted', 'halted']);
  });

  it('a sector without consent stays unlisted, and daily entries do nothing to it', () => {
    const excludedAreas: AreaId[] = ['B', 'M'];
    const steps = walk(emp, () => 2, { excludedAreas });
    const low: DailyEntry[] = range(1, 6).map((n) => ({ day: day(n), sleep: 3, exercise: 4, state: 0 }));
    const history = { checks: [{ day: D, background: emp, steps, excludedAreas }], daily: low };
    const series = timeline({ ...history, until: day(30) });
    for (const p of series.points) {
      expect(p.sectors.B).toEqual({ status: 'unlisted', target: null, price: null });
      expect(p.sectors.M).toEqual({ status: 'unlisted', target: null, price: null });
      expect(p.overallCovers).toEqual(['C', 'W', 'N']);
      expect(p.mindNotice).toBe(false);
    }
    expect(timelineInputOn(history, day(6))).toMatchObject({ overrides: [], extras: [], mindNotice: false });
  });
});

describe('quarterly retake', () => {
  it('is due 90 days after the last full check', () => {
    expect(ALGO_PARAMS[1].dailyOpen.retestAfterDays).toBe(90);
    expect(timeline({ checks: [check], until: day(89) }).retake).toEqual({ due: false, daysSinceCheck: 89, lastCheckDay: D, dueDay: day(90) });
    expect(timeline({ checks: [check], until: day(90) }).retake).toMatchObject({ due: true, daysSinceCheck: 90 });
    const retaken = timeline({ checks: [check, { day: day(100), background: emp, steps: middle }], until: day(150) });
    expect(retaken.retake).toEqual({ due: false, daysSinceCheck: 50, lastCheckDay: day(100), dueDay: day(190) });
  });
});

describe('version changes', () => {
  const variant = registerAlgo(createTestVariantAlgo());
  // Capability at its lowest and everything else at its best: the two versions disagree widely.
  const uneven: Step[] = walk(emp, (q) => (q.section === 'C' ? 0 : bestOption(q.version)));
  const checks = [{ day: D, background: emp, steps: uneven }];

  it('the day of a change is marked and not capped, and the days before it keep their numbers', () => {
    const plain = timeline({ checks, until: day(8) });
    const changed = timeline({ checks, versionChanges: [{ day: day(5), versions: { algo: variant.version } }], until: day(8) });
    const from = { ...CURRENT };
    const to = { ...CURRENT, algo: variant.version };
    expect(changed.markers).toEqual([
      { day: D, kind: 'full_check' },
      { day: day(5), kind: 'version_change', from, to },
    ]);
    expect(changed.points.map((p) => p.versionChange)).toEqual([false, false, false, false, false, true, false, false, false]);
    expect(changed.points.slice(0, 5)).toEqual(plain.points.slice(0, 5));
    expect(changed.versions).toEqual(to);
    const under = compute({ bank, background: emp, steps: uneven, versions: { algo: variant.version } });
    let largest = 0;
    for (const a of AREA_IDS) {
      expect(changed.points[5].sectors[a].price).toBe(under.sectors[a].price);
      largest = Math.max(largest, Math.abs((under.sectors[a].price as number) - (plain.points[5].sectors[a].price as number)));
    }
    expect(largest).toBeGreaterThan(LIMIT);
  });

  it('the whole series can be computed under either version', () => {
    const old = timeline({ checks, versions: { algo: 1 }, until: day(8) });
    const next = timeline({ checks, versions: { algo: variant.version }, until: day(8) });
    expect(old).toEqual(timeline({ checks, until: day(8) }));
    expect(next.markers).toEqual([{ day: D, kind: 'full_check' }]);
    expect(next.points[0].overall).not.toBe(old.points[0].overall);
    expect(next.versions?.algo).toBe(variant.version);
  });
});

describe('cost', () => {
  it('a year of full history runs in well under a tenth of a second per call', () => {
    const daily: DailyEntry[] = range(1, 364).map((n) => ({ day: day(n), sleep: n % 5, exercise: (n * 3) % 5, state: (n * 7) % 5 }));
    const paydays: PaydayBands[] = range(1, 26).map((n) => ({ day: day(14 * n), periods: 3, saveShare: n % 5, runway: null, baselineDay: D }));
    const weeklyWins: WeeklyWinEntry[] = range(0, 51).map((w) => ({ day: day(7 * w + 2), kind: w % 3 ? 'course' : 'skill', hours: w % 3 ? w % 5 : null }));
    const peopleNudges: PeopleNudgeEntry[] = range(0, 51).map((w) => ({ day: day(7 * w + 4), planned: 3, reached: w % 4 ? ['friend', 'mentor'] : [] }));
    const high = walk(emp, (q) => (q.id === 'W1' ? 6 : 2));
    const checks = [0, 91, 182, 273].map((n, i) => ({ day: day(n), background: emp, steps: i % 2 ? high : middle }));
    const input = { checks, daily, paydays, weeklyWins, peopleNudges, until: day(364) };
    timeline(input);
    const runs = 5;
    const started = performance.now();
    let series = timeline(input);
    for (let i = 1; i < runs; i++) series = timeline(input);
    const each = (performance.now() - started) / runs;
    expect(series.points).toHaveLength(365);
    expect(series.markers.filter((m) => m.kind === 'full_check')).toHaveLength(4);
    // Every micro app is in play on the last day.
    const sources = new Set([...(timelineInputOn(input, day(364))?.overrides ?? []), ...(timelineInputOn(input, day(364))?.extras ?? [])].map((x) => x.source));
    expect(sources).toEqual(new Set(['daily_open', 'payday', 'weekly_win', 'people_nudge']));
    expect(each).toBeLessThan(100);
  });
});
