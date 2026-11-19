// Every value in Standing that has no data behind it yet lives in this one file.
//
// All of them are initial settings chosen at design time. Each is to be re-estimated from real
// data once the pilot has produced enough of it. The comment on each value says what it is.
//
// Rules for changing a value:
// - Values that change a score are grouped per algorithm version in ALGO_PARAMS. Do not edit a
//   version that has produced results. Add the next version beside it and register it in
//   registry.ts, so old results can still be recomputed exactly.
// - Norms are grouped per norm version in NORMS, under the same rule.
// - Values used only by the team dashboard (red lines, go criteria) can be edited in place.
// - Edit this file, never the objects at run time. Every table here is frozen: a write from
//   code throws. A script that wants to try altered parameters copies them (structuredClone)
//   and registers the copy as a new algorithm version with registerAlgo.

import type { AlgoParamsV1 } from './algo/v1/params';
import { deepFreeze } from './freeze';
import type { NormSet } from './types';

// ---------------------------------------------------------------- algorithm parameters

export const ALGO_PARAMS: Record<number, AlgoParamsV1> = deepFreeze({
  1: {
    timing: {
      // Glance speed: how fast a reader can run their eyes over a stem. Initial setting, to be
      // re-estimated from the recorded answer times. Chinese in characters, English in words.
      scanPerMinute: { zh: 2200, en: 1400 },
      // The time threshold of a question is clamped to this range (seconds). Initial setting.
      thresholdMinSeconds: 0.6,
      thresholdMaxSeconds: 2.0,
      // An answer that is too fast still counts at least this much. Initial setting.
      multiplierFloor: 0.5,
    },
    sector: {
      // Two thirds of a sector's value come from its own questions and one third from questions
      // of other sectors that load on it. Design setting, to be re-estimated from real data.
      ownShare: 2 / 3,
      otherShare: 1 / 3,
      // A sector gets a price when at least 60% of its own questions have a score. Initial
      // setting, to be revisited once skip rates are known.
      minOwnScoredShare: 0.6,
    },
    overall: {
      // An overall price needs at least three priced sectors. Initial setting.
      minPricedSectors: 3,
    },
    price: {
      // Price scale: the group median is 100 and one standard deviation is 15 points, limited
      // to 55 (limit down) and 145 (limit up). Presentation scale chosen at design time.
      issue: 100,
      pointsPerSd: 15,
      min: 55,
      max: 145,
    },
    interest: {
      // When the interest question (itemId) is answered with an option whose score is not
      // correctScore, the capability sector (area) moves 10% of the way to the median.
      // compute reads all four values from here. Initial setting, to be re-estimated.
      itemId: 'C_int',
      area: 'C',
      correctScore: 1,
      shrink: 0.1,
    },
    skipDefaults: {
      // Tier assumed when the first wealth question is skipped: "mid", or "sup" when
      // day-to-day money is support from others. Initial setting, to be checked against the
      // tiers of people who do answer.
      tier: 'mid',
      tierWhenMoneyIsSup: 'sup',
      // Manager route assumed when the job-level question is skipped: not a manager.
      mgr: 0,
    },
    display: {
      // Half of the questions show the best option first and half the worst option first.
      bestFirstBelow: 0.5,
    },
    flags: {
      // Points of each consistency check. Initial settings, to be re-estimated once retest
      // data shows which checks predict unreliable results.
      points: { f1: 2, f2: 1, f3: 1, f4: 2, f5: 1, f6: 2, f7: 1, f8: 2, f9: 1, f11: 2, f12: 1 },
      // f10: a mean time multiplier under 0.7 gives 1 point. The reference also lists 2 points
      // under 0.5, and that level is kept here for parity with reference/test_page.html, but
      // it cannot fire: no answer counts below multiplierFloor (0.5), so the mean is never
      // under 0.5. The fastest possible session gets 1 point and keeps data grade A. Raising
      // the first `below` (the 335 reference cases stay green up to 0.55) would make it
      // reachable; that is a change of the reference rule and needs the team's decision and
      // a new algorithm version.
      speeding: [
        { below: 0.5, points: 2 },
        { below: 0.7, points: 1 },
      ],
      // f11: more than 80% of the questions asked were answered on the first position, or on
      // the last.
      samePositionShare: 0.8,
      // Data grade: 0 to 1 points A, 2 to 3 points B, 4 or more C. Initial setting.
      gradeB: 2,
      gradeC: 4,
    },
    contrasts: {
      // Smallest difference at which a contrast is reported. Initial settings, to be
      // re-estimated from the real spread of these differences.
      ladder: 0.25,
      money: 0.3,
      people: 0.3,
      health: 0.3,
      mindPoints: 10,
    },
    social: {
      // The ladder question has 10 rungs.
      rungs: 10,
      // A gap of 2 rungs or more is called a marked gap. Initial setting.
      markedGap: 2,
    },
    market: {
      // Sectors less than 3 points apart are described as level. Initial setting.
      flatBand: 3,
      // Order of the sectors on the result page.
      showOrder: ['B', 'W', 'N', 'C', 'M'],
      // A sector that moved 0.005 points or less since the previous record is unchanged: at
      // two decimals its change reads 0.00. The reference page uses the same band for its
      // flat arrow.
      unchangedBand: 0.005,
      // Movers are named only when at least two sectors are priced in both records.
      minMovers: 2,
    },
    // Daily open and payday check: a sector moves at most 2 points a day; the rest carries
    // over to the following days. Initial setting, to be re-estimated from daily data.
    dailyMoveLimitPoints: 2,
    dailyOpen: {
      // Daily data replaces a questionnaire answer only with records on 4 or more of the last
      // 7 days. Initial setting.
      windowDays: 7,
      minDays: 4,
      // Hours assumed for each sleep option: under 5, 5 to 6, 6 to 7, 7 to 9, more than 9.
      // Midpoints chosen at design time.
      sleep: { itemId: 'B3', midpointHours: [4.5, 5.5, 6.5, 8, 9.5] },
      // Minutes assumed for each exercise option: none, 1 to 19, 20 to 39, 40 to 59, 60 or
      // more. Midpoints chosen at design time. The daily mean times 7 is compared with the
      // weekly exercise question.
      exercise: { itemId: 'B2', midpointMinutes: [0, 10, 30, 50, 75], daysPerWeek: 7 },
      // The daily state question has no counterpart in the questionnaire. It enters the mind
      // sector as an extra item with load 1; its score is the mean of the last 7 days, with
      // the five options scored evenly from 0 to 1. Initial setting.
      state: { extraId: 'daily_state', area: 'M', load: 1, scores: [0, 0.25, 0.5, 0.75, 1] },
      // Body and mind are halted after 14 days in a row without a record. Initial setting.
      haltAfterDays: 14,
      // A quarterly retest is suggested 90 days after the last full check. Initial setting.
      retestAfterDays: 90,
      // Streak: yesterday can be filled in today; one missed day keeps the streak, two missed
      // days in a row reset it. Initial setting, based on the research cited in the brief.
      streak: { backfillDays: 1, resetAfterMissedDays: 2 },
      // The mind notice is shown when state was "very bad" on 5 of the last 7 days. Initial
      // setting. This is not a clinical threshold.
      mindNotice: { windowDays: 7, veryBadDays: 5 },
    },
    payday: {
      // Saving and debt shares are averaged over the last three pay periods. Initial setting.
      averagePeriods: 3,
      // Wealth is halted after 45 days without a payday check. Initial setting.
      haltAfterDays: 45,
      // Shares are amounts divided by take-home pay. Design choice, to be revisited.
      denominator: 'take_home',
      // Cash on hand divided by essential monthly spending replaces the savings question.
      runwayItemId: 'W3',
      // The saving share (high tier) or the debt share (everyone else) replaces this one.
      shareItemId: 'W5',
    },
  },
});

// ---------------------------------------------------------------- norms

const PROVISIONAL_SECTOR = { median: 0.5, sd: 0.2 } as const;

export const NORMS: Record<string, NormSet> = deepFreeze({
  // Provisional base: every sector has median 0.5 and standard deviation 0.2. This is a design
  // setting, not the real median of any group. The team replaces it by adding a new norm
  // version here after looking at the real medians, standard deviations and head counts on the
  // dashboard. Until then the result page must keep its note that the base is provisional.
  'provisional-1': {
    provisional: true,
    sectors: {
      C: { ...PROVISIONAL_SECTOR },
      W: { ...PROVISIONAL_SECTOR },
      N: { ...PROVISIONAL_SECTOR },
      B: { ...PROVISIONAL_SECTOR },
      M: { ...PROVISIONAL_SECTOR },
    },
  },
});

// ---------------------------------------------------------------- bands read off the bank

// Band edges for turning daily and payday numbers into an option of a bank question. They are
// read off the option texts of the bank, so they belong to the bank version, not to the
// algorithm. bandOptionFor in bands.ts is the one implementation of the lookup; use it and do
// not re-implement the rule.
//
// Convention: a value belongs to the last band it reaches. It reaches a band when it is at
// or above the band's lower edge, or strictly above it where lowerExclusive is true for that
// band. lowerExclusive follows the option text: "More than 9" hours starts above 9, so 9.0
// hours is "7 to 9"; "More than 6 months" starts above 6, so 6.0 months is "3 to 6 months".
// Where the text leaves an edge open ("6 to 7" and "7 to 9" hours both name 7) the value goes
// to the upper band; that part is an initial setting.
//
// Changing an edge of a bank version that has produced results would change recomputed
// history. Add a new bank version (or a new algorithm version that reads other bands) instead.
export interface BankBand {
  unit: string;
  /** Lower edge of each band, ascending. */
  lowerEdges: number[];
  /** True where the band starts strictly above its lower edge. Missing means false for every band. */
  lowerExclusive?: boolean[];
  /** Option index of each band. */
  optionForBand: number[];
}

export const BANK_BANDS: Record<string, Record<string, BankBand>> = deepFreeze({
  '2.1': {
    // B3, hours of sleep: under 5, 5 to 6, 6 to 7, 7 to 9, more than 9.
    B3: {
      unit: 'hours',
      lowerEdges: [0, 5, 6, 7, 9],
      lowerExclusive: [false, false, false, false, true],
      optionForBand: [0, 1, 2, 3, 4],
    },
    // B2, minutes of activity a week: under 30, 30 to 89, 90 to 149, 150 to 299, 300 or more.
    B2: { unit: 'minutes_per_week', lowerEdges: [0, 30, 90, 150, 300], optionForBand: [0, 1, 2, 3, 4] },
    // W3 (every version except "ret"), months savings would last: less than 2 weeks, 2 weeks
    // to 1 month, 1 to 3 months, 3 to 6 months, more than 6 months. Two weeks is taken as
    // half a month.
    W3: {
      unit: 'months',
      lowerEdges: [0, 0.5, 1, 3, 6],
      lowerExclusive: [false, false, false, false, true],
      optionForBand: [0, 1, 2, 3, 4],
    },
    // W5 version "save", share of take-home pay saved: under 5%, 5 to 9%, 10 to 19%,
    // 20 to 34%, 35% or more.
    'W5:save': { unit: 'share', lowerEdges: [0, 0.05, 0.1, 0.2, 0.35], optionForBand: [0, 1, 2, 3, 4] },
    // W5 versions "debt" and "hh", share of take-home pay that goes to debt. The options run
    // from the heaviest burden to none: 36% or more, 20 to 35%, 10 to 19%, under 10%, no debt
    // payments. A share of exactly 0 is "no debt payments"; anything above it is "under 10%".
    'W5:debt': {
      unit: 'share',
      lowerEdges: [0, 0, 0.1, 0.2, 0.36],
      lowerExclusive: [false, true, false, false, false],
      optionForBand: [4, 3, 2, 1, 0],
    },
  },
});

// ---------------------------------------------------------------- team dashboard

// Red lines on the per-question table of the team dashboard. A value past its line is shown in
// red. Initial settings, to be adjusted once the team has seen real distributions.
export const DASHBOARD_RED_LINES = deepFreeze({
  // Share of people who saw the question and skipped it.
  skipRate: 0.1,
  // Share of people who saw the question and answered nothing after it.
  dropOffRate: 0.03,
  // Median seconds compared with questions whose stems are about as long.
  timeVsSimilarStems: 2,
  // One option chosen by more than this share.
  optionShareMax: 0.6,
  // Any option chosen by less than this share.
  optionShareMin: 0.03,
  // Share of answers on an option that is not scored.
  notApplicableRate: 0.15,
  // Share of people whose answer differs between two checks taken 10 to 21 days apart.
  retestChangeRate: 0.3,
} as const);

// Two checks by the same person count as a retest when they are this many days apart. Initial
// setting.
export const RETEST_WINDOW_DAYS = deepFreeze({ min: 10, max: 21 } as const);

// Days after the first check at which return rates are reported.
export const RETURN_RATE_DAYS = deepFreeze([1, 7, 30] as const);

// What the team wants to see before it opens the next step. Shown on the dashboard for
// reference. Initial settings agreed at design time.
export const GO_CRITERIA = deepFreeze({
  // Share of started checks that are completed.
  completionRate: 0.7,
  // No question may be skipped by more than this share.
  maxItemSkipRate: 0.1,
  // Correlation of the overall price between two checks 10 to 21 days apart.
  retestCorrelation: 0.75,
  // Daily open: share of people who come back on day 7 and on day 30.
  dailyOpenDay7Return: 0.25,
  dailyOpenDay30Return: 0.12,
  // Payday check: share of active users who complete it.
  paydayCompletionShare: 0.5,
} as const);

// The recompute command reports the share of people whose overall price moves by more than
// this many points between two algorithm versions. Initial setting.
export const RECOMPUTE_MOVE_POINTS = 5;
