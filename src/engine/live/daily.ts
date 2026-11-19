// Daily Open: three taps a day (sleep, exercise, state) and what they do to the price.
//
// Replacement, not addition. With records on at least minDays of the last windowDays days:
// - the mean sleep (each option at its midpoint in hours) picks the option of the sleep
//   question, and replaces the questionnaire answer;
// - the mean daily minutes of exercise, times 7, picks the option of the weekly exercise
//   question, and replaces the questionnaire answer;
// - the state tap has no counterpart in the questionnaire, so its mean score enters the mind
//   sector as an extra item.
// Below minDays the questionnaire answers stand. Each tap is counted on its own: a day with
// sleep and without state is a day of sleep data only.
//
// A day filled in the next day (loggedOn later than day) counts for the day it describes, and
// only from the day it was entered, so a price already shown never changes afterwards.

import { bandOptionFor } from '../bands';
import { dayNumber, dayOf } from '../days';
import { CURRENT, getAlgo } from '../registry';
import { EngineError } from '../types';
import type { DailyEntry, DailyOpenParams, Extra, Override } from '../types';
import type { CheckView, LiveContribution } from './shared';
import { option } from './shared';

interface IndexedDaily {
  entry: DailyEntry;
  /** Day the entry describes. */
  at: number;
  /** Day it was entered. */
  logged: number;
}

export interface DailyIndex {
  /** Entries by the day they describe, in the order they were stored. */
  byDay: Map<number, IndexedDaily[]>;
  /** Every entry, by the day it became visible. */
  all: IndexedDaily[];
}

/** Validates the entries and lines them up by day. */
export function indexDaily(entries: readonly DailyEntry[], params: DailyOpenParams): DailyIndex {
  const byDay = new Map<number, IndexedDaily[]>();
  const all: IndexedDaily[] = [];
  const counts: Array<['sleep' | 'exercise' | 'state', number]> = [
    ['sleep', params.sleep.midpointHours.length],
    ['exercise', params.exercise.midpointMinutes.length],
    ['state', params.state.scores.length],
  ];
  for (const entry of entries) {
    const at = dayNumber(entry.day);
    const logged = entry.loggedOn === undefined ? at : dayNumber(entry.loggedOn);
    if (logged < at) throw new EngineError(`daily entry for ${entry.day} was logged before that day`);
    for (const [field, count] of counts) {
      const value = entry[field];
      if (value !== null && !option(value, count)) throw new EngineError(`daily entry for ${entry.day} has no ${field} option ${String(value)}`);
    }
    const indexed = { entry, at, logged };
    const list = byDay.get(at);
    if (list) list.push(indexed);
    else byDay.set(at, [indexed]);
    all.push(indexed);
  }
  all.sort((x, y) => x.logged - y.logged);
  return { byDay, all };
}

/** The entry for day `at` as known on day `t`: the last one stored that was entered by then. */
function visible(index: DailyIndex, at: number, t: number): DailyEntry | null {
  const list = index.byDay.get(at);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].logged <= t) return list[i].entry;
  return null;
}

/** The last day with an entry known on day `t`, or null when the daily open was not used yet. */
export function lastDailyDay(index: DailyIndex, t: number): number | null {
  let last: number | null = null;
  for (const e of index.all) {
    if (e.logged > t) break;
    if (e.at <= t && (last === null || e.at > last)) last = e.at;
  }
  return last;
}

/** What the daily records of one tap say on a day. */
export interface DailyReading {
  /** Days in the window with this tap. */
  days: number;
  /** True when there are enough days for the reading to be used. */
  used: boolean;
  /** Mean of the midpoints: hours of sleep, or minutes of exercise a day. null without a record. */
  mean: number | null;
  /** Option of the bank question the mean falls in. null unless used. */
  option: number | null;
}

export interface DailyOpenInput extends LiveContribution {
  /** True when the state was the lowest option on enough of the last days to show the mind notice. */
  mindNotice: boolean;
  sleep: DailyReading;
  exercise: DailyReading;
  /** Days in the window with a state tap, and whether the extra item is in use. */
  state: { days: number; used: boolean };
}

/** The daily contribution on day number `t`. */
export function dailyAt(index: DailyIndex, t: number, check: CheckView, params: DailyOpenParams): DailyOpenInput {
  const sleepHours: number[] = [];
  const exerciseMinutes: number[] = [];
  const stateScores: number[] = [];
  for (let at = t - params.windowDays + 1; at <= t; at++) {
    const entry = visible(index, at, t);
    if (!entry) continue;
    if (entry.sleep !== null) sleepHours.push(params.sleep.midpointHours[entry.sleep]);
    if (entry.exercise !== null) exerciseMinutes.push(params.exercise.midpointMinutes[entry.exercise]);
    if (entry.state !== null) stateScores.push(params.state.scores[entry.state]);
  }
  const lowest = params.state.scores.indexOf(Math.min(...params.state.scores));
  let veryBad = 0;
  for (let at = t - params.mindNotice.windowDays + 1; at <= t; at++) {
    if (visible(index, at, t)?.state === lowest) veryBad++;
  }
  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

  const bodyOpen = !check.excluded.has('B');
  const mindOpen = !check.excluded.has(params.state.area);
  const overrides: Override[] = [];
  const extras: Extra[] = [];

  const reading = (values: number[], itemId: string, scale: number): DailyReading => {
    const m = mean(values);
    const used = bodyOpen && values.length >= params.minDays && check.stepOf(itemId) !== undefined;
    const k = used && m !== null ? bandOptionFor(check.bankVersion, itemId, m * scale) : null;
    if (k !== null) overrides.push({ itemId, k, source: 'daily_open' });
    return { days: values.length, used, mean: m, option: k };
  };
  const sleep = reading(sleepHours, params.sleep.itemId, 1);
  const exercise = reading(exerciseMinutes, params.exercise.itemId, params.exercise.daysPerWeek);

  const stateUsed = mindOpen && stateScores.length >= params.minDays;
  if (stateUsed) {
    extras.push({
      id: params.state.extraId,
      area: params.state.area,
      load: { [params.state.area]: params.state.load },
      score: mean(stateScores) as number,
      source: 'daily_open',
    });
  }
  return {
    overrides,
    extras,
    mindNotice: mindOpen && veryBad >= params.mindNotice.veryBadDays,
    sleep,
    exercise,
    state: { days: stateScores.length, used: stateUsed },
  };
}

// ---------------------------------------------------------------- streak

export interface Streak {
  /** Days with a record in the current run. One missed day inside the run is not counted and does not end it. */
  current: number;
  /** True when today has a record. */
  recordedToday: boolean;
  /** Days before today that have no record and can still be filled in today. */
  canBackfill: string[];
  /** The last day with a record, or null. */
  lastDay: string | null;
}

/**
 * The daily streak as of `today`.
 * - Today without a record does not count as missed: the day is not over.
 * - One missed day does not reset the run; resetAfterMissedDays missed days in a row do.
 * - A missed day can be filled in for backfillDays days. A record entered later than that is
 *   kept as data and does not count toward the streak.
 */
export function dailyStreak(entries: readonly DailyEntry[], today: string, algo?: number): Streak {
  const params = getAlgo(algo).live.dailyOpen;
  const { backfillDays, resetAfterMissedDays } = params.streak;
  const t = dayNumber(today);
  const recorded = new Set<number>();
  let first: number | null = null;
  let last: number | null = null;
  for (const entry of entries) {
    const at = dayNumber(entry.day);
    const logged = entry.loggedOn === undefined ? at : dayNumber(entry.loggedOn);
    if (at > t || logged > t || logged - at > backfillDays || logged < at) continue;
    recorded.add(at);
    if (first === null || at < first) first = at;
    if (last === null || at > last) last = at;
  }
  let current = recorded.has(t) ? 1 : 0;
  if (first !== null) {
    let missed = 0;
    for (let at = t - 1; at >= first; at--) {
      if (recorded.has(at)) {
        current++;
        missed = 0;
      } else if (++missed >= resetAfterMissedDays) break;
    }
  }
  const canBackfill: string[] = [];
  for (let at = t - backfillDays; at < t; at++) if (!recorded.has(at)) canBackfill.push(dayOf(at));
  return { current, recordedToday: recorded.has(t), canBackfill, lastDay: last === null ? null : dayOf(last) };
}

/** True when an entry for `day` may be entered on `today`: today itself, or a day still open for back-fill. */
export function canLogDailyFor(day: string, today: string, algo?: number): boolean {
  const gap = dayNumber(today) - dayNumber(day);
  return gap >= 0 && gap <= getAlgo(algo).live.dailyOpen.streak.backfillDays;
}

// ---------------------------------------------------------------- public convenience

/**
 * What the daily records add to the input of compute on `day`: the overrides for sleep and
 * exercise, the extra state item, and whether the mind notice from daily data is shown. Pass
 * the result's overrides and extras to compute, and mindNotice as ComputeInput.mindNotice.
 * The timeline does this for every day; use this for a single day.
 */
export function dailyOpenInput(args: {
  entries: readonly DailyEntry[];
  day: string;
  bankVersion?: string;
  algo?: number;
}): DailyOpenInput {
  const params = getAlgo(args.algo).live.dailyOpen;
  const check: CheckView = {
    dayNumber: 0,
    bankVersion: args.bankVersion ?? CURRENT.bank,
    context: { role: 'oth', money: 'own', field: null, nowork: 0, tier: null, mgr: 0 },
    excluded: new Set(),
    // A single-day reading assumes both questions were asked.
    stepOf: (id) => ({ id, key: 'base', k: null, secs: null, lang: 'en', source: 'questionnaire' }),
  };
  return dailyAt(indexDaily(args.entries, params), dayNumber(args.day), check, params);
}
