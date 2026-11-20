// The day-by-day price: one pure function from a person's full history to the series from the
// first full check to a given day.
//
// For every day the engine works out a target price per sector: compute() on the full check
// in force that day, with the overrides and extra items the four micro apps supply (see
// live/). The price shown follows the target under three rules.
// - Steady moves. A sector moves at most dailyMoveLimitPoints a day toward its target. What
//   is left carries over to the following days. A full check sets the price with no limit: on
//   its day the price the check gives on its own is the starting point, and the micro-app
//   records of that day move it at most the daily limit from there. The day the algorithm,
//   bank or norm version changes is not capped either. Both days are marked.
// - Halts. Once a micro app has been used, its sector is halted when more than haltAfterDays
//   days have passed since the last entry: daily open for body and mind, payday for wealth,
//   weekly win for capability, people nudge for network. A halted sector holds its price. It
//   resumes on the next entry and then moves toward its target under the daily limit. A full
//   check is fresh data for every sector and also ends a halt.
// - Retake. A full check is suggested once retestAfterDays days have passed since the last.
//
// Each day is scored with the rules of the algorithm version in force that day. The caller
// supplies every day as YYYY-MM-DD; nothing here reads a clock.
//
// Cost: one compute per day whose inputs differ from another day's (identical inputs are
// scored once), and a scan of the entries per day. A year of daily history takes a few tens
// of milliseconds.

import { breakdown } from './breakdown';
import type { Breakdown } from './breakdown';
import { dayNumber, dayOf } from './days';
import { dailyAt, indexDaily, lastDailyDay } from './live/daily';
import type { DailyIndex } from './live/daily';
import { indexPaydays, lastPaydayDay, paydayAt } from './live/payday';
import type { PaydayIndex } from './live/payday';
import type { CheckView } from './live/shared';
import { indexPeopleNudges, indexWeeklyWins, lastEntryDay, peopleNudgeAt, weeklyWinAt } from './live/weekly';
import type { WeekIndex } from './live/weekly';
import { CURRENT, getAlgo, getBank } from './registry';
import { compute } from './score';
import { AREA_IDS, EngineError } from './types';
import type {
  AreaId,
  Background,
  Bank,
  ComputeInput,
  DailyEntry,
  LiveParams,
  PaydayBands,
  PeopleNudgeEntry,
  Result,
  SectorStatus,
  Step,
  VersionSet,
  WeeklyWinEntry,
} from './types';

// ---------------------------------------------------------------- input

/** One completed check with its stored steps. */
export interface TimelineCheck {
  /** The day the check was completed, YYYY-MM-DD. */
  day: string;
  background: Background;
  steps: readonly Step[];
  /** Bank the check was answered with. Defaults to CURRENT.bank. */
  bankVersion?: string;
  /** Sectors the person did not consent to. */
  excludedAreas?: readonly AreaId[];
}

/** Everything recorded for one person. Raw records, in any order. */
export interface PersonHistory {
  checks: readonly TimelineCheck[];
  daily?: readonly DailyEntry[];
  paydays?: readonly PaydayBands[];
  weeklyWins?: readonly WeeklyWinEntry[];
  peopleNudges?: readonly PeopleNudgeEntry[];
}

/** The algorithm and norm versions. The bank version belongs to each check. */
export type ScoringVersions = Partial<Pick<VersionSet, 'algo' | 'norm'>>;

/** From `day` on, results are computed with these versions. */
export interface VersionChange {
  day: string;
  versions: ScoringVersions;
}

export interface TimelineOptions {
  /** Versions in force from the first day. Defaults to CURRENT. */
  versions?: ScoringVersions;
  /** Later changes of version. Each draws a marker on its day. */
  versionChanges?: readonly VersionChange[];
}

export interface TimelineInput extends PersonHistory, TimelineOptions {
  /** The last day of the series, usually today. */
  until: string;
}

// ---------------------------------------------------------------- output

/** listed, insufficient and unlisted as in a result. halted: priced, and holding its price for lack of fresh data. */
export type TimelineStatus = SectorStatus | 'halted';

export interface TimelineSector {
  status: TimelineStatus;
  /** Price the data of that day gives. null when the sector has no price. */
  target: number | null;
  /** Price shown that day, after the daily limit and halts. */
  price: number | null;
}

export interface TimelinePoint {
  day: string;
  sectors: Record<AreaId, TimelineSector>;
  /** Mean of the shown prices of the sectors in overallCovers. null when too few are priced. */
  overall: number | null;
  /** The same over the target prices. */
  overallTarget: number | null;
  overallCovers: AreaId[];
  /** True while the mind notice is shown, from the check or from daily data. */
  mindNotice: boolean;
  /** A full check was completed that day. */
  fullCheck: boolean;
  /** The algorithm, bank or norm version differs from the day before. */
  versionChange: boolean;
  /**
   * On the day of a full check: the prices the check gives on its own, before that day's
   * micro-app records. "Since the last full check" is measured from these. null on other days.
   */
  check: { prices: Record<AreaId, number | null>; overall: number | null } | null;
}

export type TimelineMarker =
  | { day: string; kind: 'full_check' }
  | { day: string; kind: 'version_change'; from: VersionSet; to: VersionSet };

export interface Timeline {
  /** One point per day from the first full check to `until`. Empty when `until` is earlier. */
  points: TimelinePoint[];
  markers: TimelineMarker[];
  /** Versions in force on the last day. null without points. */
  versions: VersionSet | null;
  /** Sectors halted on the last day. */
  halted: AreaId[];
  /** The quarterly retake prompt as of the last day. null without points. */
  retake: { due: boolean; daysSinceCheck: number; lastCheckDay: string; dueDay: string } | null;
}

// ---------------------------------------------------------------- preparation

/** Which micro app keeps each sector fresh. One app per sector, as in the product. */
const FRESH_BY: Record<AreaId, 'daily' | 'payday' | 'weekly' | 'nudge'> = {
  B: 'daily',
  M: 'daily',
  W: 'payday',
  C: 'weekly',
  N: 'nudge',
};

interface PreparedCheck {
  check: TimelineCheck;
  index: number;
  bank: Bank;
  view: CheckView;
}

interface Prepared {
  checks: PreparedCheck[];
  daily: DailyIndex;
  paydays: PaydayIndex;
  weekly: WeekIndex<WeeklyWinEntry>;
  nudges: WeekIndex<PeopleNudgeEntry>;
  base: { algo: number; norm: string };
  changes: Array<{ at: number; versions: ScoringVersions }>;
  results: Map<string, Result>;
}

function prepare(history: PersonHistory, options: TimelineOptions): Prepared {
  const base = { algo: options.versions?.algo ?? CURRENT.algo, norm: options.versions?.norm ?? CURRENT.norm };
  const live = getAlgo(base.algo).live;
  const checks = history.checks.map((check, index): PreparedCheck => {
    const bank = getBank(check.bankVersion);
    const first = new Map<string, Step>();
    for (const step of check.steps) if (!first.has(step.id)) first.set(step.id, step);
    return {
      check,
      index,
      bank,
      view: {
        dayNumber: dayNumber(check.day),
        bankVersion: bank.bank_version,
        context: getAlgo(base.algo).contextOf(bank, check.background),
        excluded: new Set(check.excludedAreas ?? []),
        stepOf: (id) => first.get(id),
      },
    };
  });
  // Stable: checks of the same day keep their stored order, and the last one is in force.
  checks.sort((x, y) => x.view.dayNumber - y.view.dayNumber);
  const changes = (options.versionChanges ?? []).map((c) => ({ at: dayNumber(c.day), versions: c.versions }));
  changes.sort((x, y) => x.at - y.at);
  return {
    checks,
    daily: indexDaily(history.daily ?? [], live.dailyOpen),
    paydays: indexPaydays(history.paydays ?? []),
    weekly: indexWeeklyWins(history.weeklyWins ?? [], live.weeklyWin),
    nudges: indexPeopleNudges(history.peopleNudges ?? []),
    base,
    changes,
    results: new Map(),
  };
}

function checkOn(prepared: Prepared, t: number): PreparedCheck | null {
  let found: PreparedCheck | null = null;
  for (const c of prepared.checks) {
    if (c.view.dayNumber > t) break;
    found = c;
  }
  return found;
}

function versionsOn(prepared: Prepared, t: number, bankVersion: string): VersionSet {
  let { algo, norm } = prepared.base;
  for (const change of prepared.changes) {
    if (change.at > t) break;
    algo = change.versions.algo ?? algo;
    norm = change.versions.norm ?? norm;
  }
  return { algo, bank: bankVersion, norm };
}

interface DayState {
  check: PreparedCheck;
  versions: VersionSet;
  live: LiveParams;
  input: ComputeInput;
  /** Identifies the input: equal keys give equal results. */
  key: string;
}

function stateOn(prepared: Prepared, t: number): DayState | null {
  const check = checkOn(prepared, t);
  if (!check) return null;
  const versions = versionsOn(prepared, t, check.bank.bank_version);
  const live = getAlgo(versions.algo).live;
  const daily = dailyAt(prepared.daily, t, check.view, live.dailyOpen);
  const payday = paydayAt(prepared.paydays, t, check.view, live.payday);
  const weekly = weeklyWinAt(prepared.weekly, t, check.view, live.weeklyWin);
  const nudge = peopleNudgeAt(prepared.nudges, t, check.view, live.peopleNudge);
  const overrides = [...daily.overrides, ...payday.overrides, ...weekly.overrides, ...nudge.overrides];
  const extras = [...daily.extras, ...payday.extras, ...weekly.extras, ...nudge.extras];
  const key = [
    check.index,
    versions.algo,
    versions.norm,
    overrides.map((o) => `${o.itemId}:${o.k}`).join(','),
    extras.map((e) => `${e.id}:${e.score}`).join(','),
    daily.mindNotice ? 1 : 0,
  ].join('|');
  return {
    check,
    versions,
    live,
    key,
    input: {
      bank: check.bank,
      background: check.check.background,
      steps: check.check.steps,
      versions,
      excludedAreas: check.check.excludedAreas,
      overrides,
      extras,
      mindNotice: daily.mindNotice,
    },
  };
}

/** The same day without the micro-app records: the full check in force on its own. */
function checkOnly(state: DayState): DayState {
  return {
    ...state,
    key: `${state.key}|check-only`,
    input: { ...state.input, overrides: [], extras: [], mindNotice: false },
  };
}

function resultOf(prepared: Prepared, state: DayState): Result {
  let result = prepared.results.get(state.key);
  if (!result) {
    result = compute(state.input);
    prepared.results.set(state.key, result);
  }
  return result;
}

/** The last day on or before `t` with an entry of the micro app that keeps the sector fresh. */
function lastFresh(prepared: Prepared, area: AreaId, t: number): number | null {
  switch (FRESH_BY[area]) {
    case 'daily':
      return lastDailyDay(prepared.daily, t);
    case 'payday':
      return lastPaydayDay(prepared.paydays, t);
    case 'weekly':
      return lastEntryDay(prepared.weekly, t);
    default:
      return lastEntryDay(prepared.nudges, t);
  }
}

function haltAfter(live: LiveParams, area: AreaId): number {
  switch (FRESH_BY[area]) {
    case 'daily':
      return live.dailyOpen.haltAfterDays;
    case 'payday':
      return live.payday.haltAfterDays;
    case 'weekly':
      return live.weeklyWin.haltAfterDays;
    default:
      return live.peopleNudge.haltAfterDays;
  }
}

const sameVersions = (x: VersionSet, y: VersionSet): boolean => x.algo === y.algo && x.bank === y.bank && x.norm === y.norm;

// ---------------------------------------------------------------- the series

/**
 * The day-by-day series of one person from the first full check to `until`. See the top of
 * this file for the rules.
 */
export function timeline(input: TimelineInput): Timeline {
  const prepared = prepare(input, input);
  const until = dayNumber(input.until);
  const points: TimelinePoint[] = [];
  const markers: TimelineMarker[] = [];
  const empty: Timeline = { points, markers, versions: null, halted: [], retake: null };
  if (prepared.checks.length === 0) return empty;
  const first = prepared.checks[0].view.dayNumber;
  if (until < first) return empty;
  const checkDays = new Set(prepared.checks.map((c) => c.view.dayNumber));

  const shown: Record<AreaId, number | null> = { C: null, W: null, N: null, B: null, M: null };
  let previousVersions: VersionSet | null = null;
  let last: DayState | null = null;

  for (let t = first; t <= until; t++) {
    const state = stateOn(prepared, t);
    if (!state) throw new EngineError('no check in force inside the series');
    const result = resultOf(prepared, state);
    const day = dayOf(t);
    const fullCheck = checkDays.has(t);
    const versionChange = previousVersions !== null && !sameVersions(previousVersions, state.versions);
    if (fullCheck) markers.push({ day, kind: 'full_check' });
    if (versionChange) markers.push({ day, kind: 'version_change', from: previousVersions as VersionSet, to: state.versions });
    const uncapped = fullCheck || versionChange;
    const limit = state.live.dailyMoveLimitPoints;
    // On a check day, what the check gives on its own. The day's records move from there.
    const own = fullCheck ? resultOf(prepared, checkOnly(state)) : null;
    const step = (from: number, target: number): number =>
      Math.abs(target - from) <= limit ? target : from + (target > from ? limit : -limit);

    const sectors = {} as Record<AreaId, TimelineSector>;
    for (const area of AREA_IDS) {
      const sector = result.sectors[area];
      const target = sector.price;
      if (target === null) {
        shown[area] = null;
        sectors[area] = { status: sector.status, target: null, price: null };
        continue;
      }
      const fresh = lastFresh(prepared, area, t);
      const halted = fresh !== null && t - Math.max(fresh, state.check.view.dayNumber) > haltAfter(state.live, area);
      const before = shown[area];
      const base = own?.sectors[area].price ?? null;
      let price: number;
      if (base !== null) price = step(base, target);
      else if (uncapped || before === null) price = target;
      else if (halted) price = before;
      else price = step(before, target);
      shown[area] = price;
      sectors[area] = { status: halted ? 'halted' : 'listed', target, price };
    }
    const covers = result.overallCovers;
    const meanOf = (pick: (s: TimelineSector) => number | null): number | null =>
      covers.length === 0 ? null : covers.reduce((sum, a) => sum + (pick(sectors[a]) as number), 0) / covers.length;
    points.push({
      day,
      sectors,
      overall: meanOf((s) => s.price),
      overallTarget: meanOf((s) => s.target),
      overallCovers: [...covers],
      mindNotice: result.mindNotice,
      fullCheck,
      versionChange,
      check: own
        ? { prices: Object.fromEntries(AREA_IDS.map((a) => [a, own.sectors[a].price])) as Record<AreaId, number | null>, overall: own.overall }
        : null,
    });
    previousVersions = state.versions;
    last = state;
  }

  const final = last as DayState;
  const lastCheckAt = final.check.view.dayNumber;
  const retestAfter = final.live.dailyOpen.retestAfterDays;
  const lastPoint = points[points.length - 1];
  return {
    points,
    markers,
    versions: final.versions,
    halted: AREA_IDS.filter((a) => lastPoint.sectors[a].status === 'halted'),
    retake: {
      due: until - lastCheckAt >= retestAfter,
      daysSinceCheck: until - lastCheckAt,
      lastCheckDay: dayOf(lastCheckAt),
      dueDay: dayOf(lastCheckAt + retestAfter),
    },
  };
}

/**
 * The input to compute behind the target prices of one day: the full check in force with the
 * overrides and extra items of that day. null before the first full check. Feed two of these
 * to breakdown(), or call explainDays.
 */
export function timelineInputOn(history: PersonHistory, day: string, options: TimelineOptions = {}): ComputeInput | null {
  return stateOn(prepare(history, options), dayNumber(day))?.input ?? null;
}

/**
 * "Why it moved" on the day of a full check: from the check on its own to the day with its
 * micro-app records. null when no check is in force on that day.
 */
export function explainCheckDay(history: PersonHistory, day: string, options: TimelineOptions = {}): Breakdown | null {
  const state = stateOn(prepare(history, options), dayNumber(day));
  return state ? breakdown(checkOnly(state).input, state.input) : null;
}

/**
 * "Why it moved" between two days of the timeline. It explains the target prices: what the
 * data of each day gives. The price shown can trail its target by the daily limit or a halt,
 * so compare with the `target` of the two points, not with `price`. null when either day is
 * before the first full check.
 */
export function explainDays(history: PersonHistory, from: string, to: string, options: TimelineOptions = {}): Breakdown | null {
  const prepared = prepare(history, options);
  const before = stateOn(prepared, dayNumber(from));
  const after = stateOn(prepared, dayNumber(to));
  return before && after ? breakdown(before.input, after.input) : null;
}
