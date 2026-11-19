// Daily Open (PROMPT.md section 9): replacement, the 4 of 7 condition, the state item, the mind
// notice, and the streak with its back-fill.

import { describe, expect, it } from 'vitest';
import {
  ALGO_PARAMS,
  EngineError,
  addDays,
  canLogDailyFor,
  compute,
  dailyOpenInput,
  dailyStreak,
  timeline,
} from '../../../src/engine';
import type { DailyEntry } from '../../../src/engine';
import { backgroundFor, bank, walk, withAnswer } from './helpers';

const D = '2026-03-02';
const day = (n: number): string => addDays(D, n);
const emp = backgroundFor('emp');
const middle = walk(emp, () => 2);
const P = ALGO_PARAMS[1].dailyOpen;

/** One entry per listed day offset, with the same three taps. */
const entries = (offsets: number[], sleep: number | null, exercise: number | null, state: number | null): DailyEntry[] =>
  offsets.map((n) => ({ day: day(n), sleep, exercise, state }));

describe('the three daily taps match the bank', () => {
  it('sleep has the options of B3, and each set of midpoints has one value per option', () => {
    expect(bank.items.B3.versions[0].opts.map((o) => o.en)).toEqual(['Under 5', '5 to 6', '6 to 7', '7 to 9', 'More than 9']);
    expect(P.sleep.midpointHours).toEqual([4.5, 5.5, 6.5, 8, 9.5]);
    expect(P.exercise.midpointMinutes).toEqual([0, 10, 30, 50, 75]);
    expect(P.state.scores).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect([P.windowDays, P.minDays]).toEqual([7, 4]);
  });
});

describe('replacement, not addition', () => {
  // Four days of "7 to 9" hours, 20 to 39 minutes, and the best state.
  const four = entries([1, 2, 3, 4], 3, 2, 4);
  const input = dailyOpenInput({ entries: four, day: day(4) });

  it('the 7-day mean sleep picks the option of B3, and daily minutes times 7 the option of B2', () => {
    // 8 hours is "7 to 9". 30 minutes a day is 210 a week: "150 to 299".
    expect(input.sleep).toEqual({ days: 4, used: true, mean: 8, option: 3 });
    expect(input.exercise).toEqual({ days: 4, used: true, mean: 30, option: 3 });
    expect(input.overrides).toEqual([
      { itemId: 'B3', k: 3, source: 'daily_open' },
      { itemId: 'B2', k: 3, source: 'daily_open' },
    ]);
  });

  it('the score equals a questionnaire in which those two answers were given: nothing is added to body', () => {
    const replaced = compute({ bank, background: emp, steps: middle, overrides: input.overrides });
    const answered = compute({ bank, background: emp, steps: withAnswer(withAnswer(middle, 'B3', 3), 'B2', 3) });
    expect(replaced.sectors).toEqual(answered.sectors);
    expect(replaced.sectors.B.ownItems).toBe(5);
    expect(replaced.sectors.B.price as number).toBeGreaterThan(compute({ bank, background: emp, steps: middle }).sectors.B.price as number);
  });

  it('daily data carries the source "daily_open" and counts at full weight', () => {
    const hasty = middle.map((s) => (s.id === 'B3' || s.id === 'B2' ? { ...s, secs: 0.01 } : s));
    const result = compute({ bank, background: emp, steps: hasty, overrides: input.overrides, extras: input.extras });
    for (const id of ['B3', 'B2']) {
      expect(result.steps.find((s) => s.id === id)).toMatchObject({ overridden: true, source: 'daily_open', multiplier: 1, timeMultiplier: 0.5 });
    }
    expect(result.extras).toEqual([{ id: 'daily_state', area: 'M', source: 'daily_open', counted: true }]);
  });

  it('the mean runs over the midpoints, so mixed days can land in a band nobody tapped', () => {
    // Two nights under 5 hours and two of 7 to 9: 6.25 hours, "6 to 7".
    const mixed = [...entries([1, 2], 0, 0, null), ...entries([3, 4], 3, 1, null)];
    const read = dailyOpenInput({ entries: mixed, day: day(4) });
    expect(read.sleep).toMatchObject({ mean: 6.25, option: 2 });
    // 0, 0, 10 and 10 minutes: 5 a day, 35 a week, "30 to 89".
    expect(read.exercise).toMatchObject({ mean: 5, option: 1 });
    // 60 minutes or more every day is 525 a week: "300 or more".
    expect(dailyOpenInput({ entries: entries([1, 2, 3, 4], null, 4, null), day: day(4) }).exercise.option).toBe(4);
  });
});

describe('the state tap is an extra item in mind', () => {
  it('load 1 on mind, the 7-day mean of 0, 0.25, 0.5, 0.75, 1, source daily_open', () => {
    const mixed: DailyEntry[] = [
      { day: day(1), sleep: null, exercise: null, state: 4 },
      { day: day(2), sleep: null, exercise: null, state: 2 },
      { day: day(3), sleep: null, exercise: null, state: 1 },
      { day: day(4), sleep: null, exercise: null, state: 3 },
    ];
    const input = dailyOpenInput({ entries: mixed, day: day(4) });
    expect(input.extras).toEqual([{ id: 'daily_state', area: 'M', load: { M: 1 }, score: (1 + 0.5 + 0.25 + 0.75) / 4, source: 'daily_open' }]);
    expect(input.overrides).toEqual([]);
    const base = compute({ bank, background: emp, steps: middle });
    const withState = compute({ bank, background: emp, steps: middle, extras: input.extras });
    // One more own item in mind, and no other sector moves.
    expect(withState.sectors.M.ownItems).toBe(base.sectors.M.ownItems + 1);
    for (const a of ['C', 'W', 'N', 'B'] as const) expect(withState.sectors[a]).toEqual(base.sectors[a]);
  });
});

describe('at least 4 of the last 7 days', () => {
  it('three days leave the questionnaire answers alone, four replace them', () => {
    const three = dailyOpenInput({ entries: entries([1, 2, 3], 3, 2, 4), day: day(3) });
    expect(three.overrides).toEqual([]);
    expect(three.extras).toEqual([]);
    expect(three.sleep).toEqual({ days: 3, used: false, mean: 8, option: null });
    expect(dailyOpenInput({ entries: entries([1, 2, 3, 4], 3, 2, 4), day: day(4) }).overrides).toHaveLength(2);
  });

  it('the window is the day itself and the six before it', () => {
    const four = entries([1, 2, 3, 4], 3, 2, 4);
    // On day 7 the window is days 1 to 7: all four count. On day 8 it is days 2 to 8: three.
    expect(dailyOpenInput({ entries: four, day: day(7) }).overrides).toHaveLength(2);
    expect(dailyOpenInput({ entries: four, day: day(8) }).overrides).toEqual([]);
    // Entries of later days are not known yet.
    expect(dailyOpenInput({ entries: four, day: day(3) }).overrides).toEqual([]);
  });

  it('each tap is counted on its own', () => {
    const partial: DailyEntry[] = [...entries([1, 2, 3], 3, 2, 4), { day: day(4), sleep: 3, exercise: null, state: null }];
    const input = dailyOpenInput({ entries: partial, day: day(4) });
    expect(input.overrides).toEqual([{ itemId: 'B3', k: 3, source: 'daily_open' }]);
    expect(input.exercise).toMatchObject({ days: 3, used: false });
    expect(input.state).toEqual({ days: 3, used: false });
    expect(input.extras).toEqual([]);
  });

  it('the timeline uses the questionnaire answer until the fourth day', () => {
    const series = timeline({ checks: [{ day: D, background: emp, steps: middle }], daily: entries([1, 2, 3, 4], 3, 2, null), until: day(4) });
    const body = series.points.map((p) => p.sectors.B.target);
    expect(body.slice(0, 4)).toEqual([body[0], body[0], body[0], body[0]]);
    expect(body[4] as number).toBeGreaterThan(body[0] as number);
  });

  it('refuses an option that does not exist', () => {
    expect(() => dailyOpenInput({ entries: [{ day: D, sleep: 5, exercise: null, state: null }], day: D })).toThrow(EngineError);
    expect(() => dailyOpenInput({ entries: [{ day: D, sleep: null, exercise: null, state: -1 }], day: D })).toThrow(EngineError);
    expect(() => dailyOpenInput({ entries: [{ day: '2026-02-30', sleep: 1, exercise: null, state: null }], day: D })).toThrow(EngineError);
  });
});

describe('mind notice from daily data', () => {
  const low = (offsets: number[]): DailyEntry[] => entries(offsets, null, null, 0);

  it('is shown when 5 of the last 7 days are the lowest state, and not at 4', () => {
    expect(P.mindNotice).toEqual({ windowDays: 7, veryBadDays: 5 });
    expect(dailyOpenInput({ entries: low([1, 2, 3, 4]), day: day(4) }).mindNotice).toBe(false);
    expect(dailyOpenInput({ entries: low([1, 2, 3, 4, 5]), day: day(5) }).mindNotice).toBe(true);
    expect(dailyOpenInput({ entries: [...low([1, 2, 3, 4]), ...entries([5, 6, 7], null, null, 1)], day: day(7) }).mindNotice).toBe(false);
    // Day 8: the window is days 2 to 8 and holds four of the five.
    expect(dailyOpenInput({ entries: low([1, 2, 3, 4, 5]), day: day(8) }).mindNotice).toBe(false);
  });

  it('reaches the result through the timeline, and mind is then never the laggard', () => {
    const series = timeline({ checks: [{ day: D, background: emp, steps: middle }], daily: low([1, 2, 3, 4, 5]), until: day(5) });
    expect(series.points.map((p) => p.mindNotice)).toEqual([false, false, false, false, false, true]);
    const input = dailyOpenInput({ entries: low([1, 2, 3, 4, 5]), day: day(5) });
    const result = compute({ bank, background: emp, steps: middle, extras: input.extras, mindNotice: input.mindNotice });
    expect(result.mindNotice).toBe(true);
    expect(result.mindAlert).toBe(false);
    expect(result.market.laggard).not.toBe('M');
  });
});

describe('streak', () => {
  const on = (offsets: number[]): DailyEntry[] => entries(offsets, 3, 2, 3);

  it('counts the days recorded in a row', () => {
    expect(P.streak).toEqual({ backfillDays: 1, resetAfterMissedDays: 2 });
    expect(dailyStreak(on([1, 2, 3, 4, 5]), day(5))).toEqual({ current: 5, recordedToday: true, canBackfill: [], lastDay: day(5) });
    expect(dailyStreak([], day(5))).toEqual({ current: 0, recordedToday: false, canBackfill: [day(4)], lastDay: null });
  });

  it('today without a record is not a missed day yet', () => {
    expect(dailyStreak(on([1, 2, 3, 4, 5]), day(6))).toMatchObject({ current: 5, recordedToday: false, canBackfill: [] });
  });

  it('one missed day does not reset the streak, and is not counted', () => {
    expect(dailyStreak(on([1, 2, 4, 5]), day(5)).current).toBe(4);
    // Missed yesterday, nothing yet today: the run is still alive and yesterday can be filled in.
    expect(dailyStreak(on([1, 2, 3]), day(5))).toMatchObject({ current: 3, canBackfill: [day(4)] });
  });

  it('two missed days in a row reset it', () => {
    expect(dailyStreak(on([1, 2, 5]), day(5)).current).toBe(1);
    expect(dailyStreak(on([1, 2, 3]), day(6)).current).toBe(0);
  });

  it('yesterday can be filled in today, and no earlier day', () => {
    expect(canLogDailyFor(day(4), day(4))).toBe(true);
    expect(canLogDailyFor(day(3), day(4))).toBe(true);
    expect(canLogDailyFor(day(2), day(4))).toBe(false);
    expect(canLogDailyFor(day(5), day(4))).toBe(false);
    const missed = on([1, 2, 4]);
    expect(dailyStreak(missed, day(4))).toMatchObject({ current: 3, canBackfill: [day(3)] });
    const filled: DailyEntry[] = [...missed, { day: day(3), loggedOn: day(4), sleep: 2, exercise: 1, state: 2 }];
    expect(dailyStreak(filled, day(4))).toMatchObject({ current: 4, canBackfill: [] });
    // A record entered two days late is kept as data and does not count toward the streak.
    const late: DailyEntry[] = [...on([1, 4, 5]), { day: day(2), loggedOn: day(4), sleep: 2, exercise: 1, state: 2 }];
    expect(dailyStreak(late, day(5)).current).toBe(2);
  });

  it('a back-filled day counts for the day it describes, from the day it was entered', () => {
    const check = [{ day: D, background: emp, steps: middle }];
    const three = entries([1, 2, 4], 3, 2, null);
    const filled: DailyEntry[] = [...three, { day: day(3), loggedOn: day(4), sleep: 3, exercise: 2, state: null }];
    // Day 4 has four of seven days once day 3 is filled in on day 4.
    const without = timeline({ checks: check, daily: three, until: day(4) });
    const withIt = timeline({ checks: check, daily: filled, until: day(4) });
    expect(without.points[4].sectors.B.target).toBe(without.points[0].sectors.B.target);
    expect(withIt.points[4].sectors.B.target as number).toBeGreaterThan(withIt.points[0].sectors.B.target as number);
    // The points of days 0 to 3, already shown, are what they were.
    expect(withIt.points.slice(0, 4)).toEqual(without.points.slice(0, 4));
    expect(() => timeline({ checks: check, daily: [{ day: day(3), loggedOn: day(2), sleep: 1, exercise: 1, state: 1 }], until: day(4) })).toThrow(EngineError);
  });
});
