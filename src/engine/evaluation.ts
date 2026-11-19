// The seven scoring tests: range, stability, response, validity, fairness, gaming, version
// effect. Pure functions over arrays of plain records. Each returns numbers and a short
// machine-readable verdict:
//   "pass"               every threshold is met;
//   "warn"               at least one threshold is missed, named in `reasons`;
//   "insufficient_data"  fewer records than EVALUATION.minRecords, numbers reported anyway.
// The thresholds live in EVALUATION in config.ts and are initial settings. A verdict is a
// prompt for the team to look, not a judgement of the scoring.
//
// The records carry prices, cohort labels and flags. They carry no answer values except where
// a test needs them (response counts changed answers from option indices).

import { ALGO_PARAMS, EVALUATION, RECOMPUTE_MOVE_POINTS } from './config';
import { CURRENT } from './registry';
import { AREA_IDS } from './types';
import type { AreaId, FlagId, Grade } from './types';

// ---------------------------------------------------------------- records

/** One scored session. */
export interface EvalRecord {
  /** Cohort labels. Any text: a role id, an age band. */
  role: string;
  age: string | number;
  overall: number | null;
  sectors: Partial<Record<AreaId, number | null>>;
  grade?: Grade;
  /** Ids of the consistency checks that fired. */
  flags?: readonly FlagId[];
  /** Option index of the ladder question, or null when skipped. */
  ladder?: number | null;
  /** SocialPosition.objectivePrice: the mean of the wealth and capability prices. */
  objectivePrice?: number | null;
}

/** The answers of one session, as far as the response test needs them. */
export interface EvalAnswer {
  id: string;
  key: string;
  k: number | null;
}

/** Two sessions of the same person. */
export interface EvalPair {
  first: { overall: number | null; steps?: readonly EvalAnswer[] };
  second: { overall: number | null; steps?: readonly EvalAnswer[] };
  /** Days between the two. */
  daysApart?: number;
}

/** The overall price of the same session under two versions. */
export interface EvalVersionPair {
  before: number | null;
  after: number | null;
}

export type Verdict = 'pass' | 'warn' | 'insufficient_data';

interface Judged {
  verdict: Verdict;
  /** Which thresholds were missed. Empty unless the verdict is "warn". */
  reasons: string[];
  /** Records the test could use. */
  n: number;
}

function judge(n: number, reasons: string[]): Judged {
  if (n < EVALUATION.minRecords) return { verdict: 'insufficient_data', reasons: [], n };
  return { verdict: reasons.length ? 'warn' : 'pass', reasons, n };
}

// ---------------------------------------------------------------- statistics

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Sample standard deviation (n minus 1). null for fewer than two values. */
export function standardDeviation(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (values.length - 1));
}

/** Quantile by linear interpolation between order statistics. q from 0 to 1. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/** Pearson correlation. null for fewer than two pairs or when either side does not vary. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n)) as number;
  const my = mean(ys.slice(0, n)) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
    syy += (ys[i] - my) * (ys[i] - my);
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** Ranks from 1, ties sharing the mean of their ranks. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((x, y) => x.value - y.value);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
    for (let r = i; r <= j; r++) out[order[r].index] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation: Pearson on the ranks. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  return pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)));
}

const isNumber = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

// ---------------------------------------------------------------- 1. range

export interface RangeTest extends Judged {
  /** Spread of the overall price. */
  overall: { min: number | null; p5: number | null; median: number | null; p95: number | null; max: number | null; mean: number | null; sd: number | null };
  /** Sector prices looked at, and the share of them on the lower and on the upper limit. */
  sectorPrices: number;
  shareAtLimitDown: number | null;
  shareAtLimitUp: number | null;
}

/**
 * Range: do prices spread, and do they pile up at the limits?
 * Reads the overall price of every record and every sector price. Warns when the standard
 * deviation of the overall price is under minOverallSd ("narrow_spread"), or when more than
 * maxShareAtLimits of all sector prices sit on the lower or upper limit ("at_limits"). The
 * limits default to those of the current algorithm version.
 */
export function rangeTest(records: readonly EvalRecord[], limits?: { min: number; max: number }): RangeTest {
  const { min, max } = limits ?? ALGO_PARAMS[CURRENT.algo].price;
  const overall = records.map((r) => r.overall).filter(isNumber);
  const prices = records.flatMap((r) => AREA_IDS.map((a) => r.sectors[a]).filter(isNumber));
  const down = prices.length ? prices.filter((p) => p <= min).length / prices.length : null;
  const up = prices.length ? prices.filter((p) => p >= max).length / prices.length : null;
  const sd = standardDeviation(overall);
  const reasons: string[] = [];
  if (sd !== null && sd < EVALUATION.range.minOverallSd) reasons.push('narrow_spread');
  if (down !== null && up !== null && down + up > EVALUATION.range.maxShareAtLimits) reasons.push('at_limits');
  return {
    ...judge(overall.length, reasons),
    overall: {
      min: overall.length ? Math.min(...overall) : null,
      p5: quantile(overall, 0.05),
      median: median(overall),
      p95: quantile(overall, 0.95),
      max: overall.length ? Math.max(...overall) : null,
      mean: mean(overall),
      sd,
    },
    sectorPrices: prices.length,
    shareAtLimitDown: down,
    shareAtLimitUp: up,
  };
}

// ---------------------------------------------------------------- 2. stability

export interface StabilityTest extends Judged {
  /** Pearson correlation of the overall price between the first and the second check. */
  correlation: number | null;
  /** Mean absolute difference of the overall price, in points. */
  meanAbsoluteChange: number | null;
}

/**
 * Stability: does the same person get about the same price again?
 * Reads pairs of checks by the same person; the caller selects pairs 10 to 21 days apart
 * (RETEST_WINDOW_DAYS). Pairs without both overall prices are left out. Warns when the
 * correlation is under minRetestCorrelation ("low_retest_correlation").
 */
export function stabilityTest(pairs: readonly EvalPair[]): StabilityTest {
  const usable = pairs.filter((p) => isNumber(p.first.overall) && isNumber(p.second.overall));
  const xs = usable.map((p) => p.first.overall as number);
  const ys = usable.map((p) => p.second.overall as number);
  const correlation = pearson(xs, ys);
  const reasons: string[] = [];
  if (correlation === null || correlation < EVALUATION.stability.minRetestCorrelation) reasons.push('low_retest_correlation');
  return {
    ...judge(usable.length, reasons),
    correlation,
    meanAbsoluteChange: mean(xs.map((x, i) => Math.abs(ys[i] - x))),
  };
}

// ---------------------------------------------------------------- 3. response

/** Questions answered in both sessions under the same wording with a different option. Skips do not count. */
export function changedAnswers(first: readonly EvalAnswer[], second: readonly EvalAnswer[]): number {
  const before = new Map(first.map((s) => [s.id, s]));
  let changed = 0;
  for (const s of second) {
    const was = before.get(s.id);
    if (was && was.key === s.key && was.k !== null && s.k !== null && was.k !== s.k) changed++;
  }
  return changed;
}

export interface ResponseTest extends Judged {
  /** Changed answers over all usable pairs. */
  changedAnswers: number;
  /** Sum of absolute overall changes divided by the number of changed answers, in points. */
  pointsPerChangedAnswer: number | null;
  /** Share of pairs with at least one changed answer whose overall price did not move. */
  shareUnmoved: number | null;
}

/**
 * Response: does the price move when answers change?
 * Reads pairs that carry the steps of both sessions and both overall prices; pairs with no
 * changed answer are left out. The measure is the mean absolute change of the overall price
 * per changed answer. Warns when it is under minPointsPerChangedAnswer ("unresponsive") or
 * over maxPointsPerChangedAnswer ("jumpy").
 */
export function responseTest(pairs: readonly EvalPair[]): ResponseTest {
  let pairsUsed = 0;
  let changed = 0;
  let moved = 0;
  let unmoved = 0;
  for (const p of pairs) {
    if (!isNumber(p.first.overall) || !isNumber(p.second.overall) || !p.first.steps || !p.second.steps) continue;
    const c = changedAnswers(p.first.steps, p.second.steps);
    if (c === 0) continue;
    const change = Math.abs(p.second.overall - p.first.overall);
    pairsUsed++;
    changed += c;
    moved += change;
    if (change <= EVALUATION.response.unmovedBand) unmoved++;
  }
  const perAnswer = changed ? moved / changed : null;
  const reasons: string[] = [];
  if (perAnswer !== null && perAnswer < EVALUATION.response.minPointsPerChangedAnswer) reasons.push('unresponsive');
  if (perAnswer !== null && perAnswer > EVALUATION.response.maxPointsPerChangedAnswer) reasons.push('jumpy');
  return {
    ...judge(pairsUsed, reasons),
    changedAnswers: changed,
    pointsPerChangedAnswer: perAnswer,
    shareUnmoved: pairsUsed ? unmoved / pairsUsed : null,
  };
}

// ---------------------------------------------------------------- 4. validity

export interface ValidityTest extends Judged {
  /** Spearman correlation between the objective price and the ladder answer. */
  ladderCorrelation: number | null;
  /** Records with both an objective price and a ladder answer. */
  ladderRecords: number;
  /** Pearson correlation of every pair of sectors, keyed "C-W". null when it cannot be computed. */
  sectorCorrelations: Record<string, number | null>;
  highestSectorCorrelation: number | null;
}

/**
 * Validity: do the prices relate to each other the way they should?
 * Two checks. (a) Objective position (the mean of the wealth and capability prices) against
 * the rung the person puts themselves on: people who are better off should, on the whole,
 * place themselves higher. Note that the ladder question loads on wealth and capability, so a
 * part of this correlation is built in. Warns under minLadderCorrelation ("ladder_unrelated").
 * (b) Each pair of sectors, over the records that price both: sectors are meant to measure
 * different things. Warns when a pair is over maxSectorCorrelation ("sectors_overlap").
 */
export function validityTest(records: readonly EvalRecord[]): ValidityTest {
  const withLadder = records.filter((r) => isNumber(r.ladder) && isNumber(r.objectivePrice));
  const ladderCorrelation = spearman(
    withLadder.map((r) => r.objectivePrice as number),
    withLadder.map((r) => r.ladder as number),
  );
  const sectorCorrelations: Record<string, number | null> = {};
  let highest: number | null = null;
  AREA_IDS.forEach((a, i) => {
    for (const b of AREA_IDS.slice(i + 1)) {
      const both = records.filter((r) => isNumber(r.sectors[a]) && isNumber(r.sectors[b]));
      const c = pearson(both.map((r) => r.sectors[a] as number), both.map((r) => r.sectors[b] as number));
      sectorCorrelations[`${a}-${b}`] = c;
      if (c !== null && (highest === null || c > highest)) highest = c;
    }
  });
  const reasons: string[] = [];
  if (ladderCorrelation === null || ladderCorrelation < EVALUATION.validity.minLadderCorrelation) reasons.push('ladder_unrelated');
  if (highest !== null && highest > EVALUATION.validity.maxSectorCorrelation) reasons.push('sectors_overlap');
  return {
    ...judge(withLadder.length, reasons),
    ladderCorrelation,
    ladderRecords: withLadder.length,
    sectorCorrelations,
    highestSectorCorrelation: highest,
  };
}

// ---------------------------------------------------------------- 5. fairness

export interface GroupMedian {
  group: string;
  n: number;
  median: number;
  /** False for a group under minGroupSize: reported, and left out of the gap. */
  counted: boolean;
}

export interface FairnessTest extends Judged {
  byRole: GroupMedian[];
  byAge: GroupMedian[];
  /** Largest difference between the medians of two counted groups. null with fewer than two. */
  largestRoleGap: number | null;
  largestAgeGap: number | null;
}

function medians(records: readonly EvalRecord[], label: (r: EvalRecord) => string): { groups: GroupMedian[]; gap: number | null } {
  const byGroup = new Map<string, number[]>();
  for (const r of records) {
    if (!isNumber(r.overall)) continue;
    const key = label(r);
    const list = byGroup.get(key);
    if (list) list.push(r.overall);
    else byGroup.set(key, [r.overall]);
  }
  const groups = [...byGroup.entries()]
    .map(([group, values]) => ({
      group,
      n: values.length,
      median: median(values) as number,
      counted: values.length >= EVALUATION.fairness.minGroupSize,
    }))
    .sort((x, y) => (x.group < y.group ? -1 : x.group > y.group ? 1 : 0));
  const counted = groups.filter((g) => g.counted).map((g) => g.median);
  return { groups, gap: counted.length >= 2 ? Math.max(...counted) - Math.min(...counted) : null };
}

/**
 * Fairness: does one role or one age band get systematically higher prices?
 * The price is meant to compare a person with people in the same situation, so the median
 * overall price of every role and of every age band should sit near 100. Reads the overall
 * price by role and by age band, takes the median of every group of at least minGroupSize,
 * and warns when the largest gap between two roles ("role_gap") or two age bands ("age_gap")
 * is over maxMedianGap.
 */
export function fairnessTest(records: readonly EvalRecord[]): FairnessTest {
  const role = medians(records, (r) => r.role);
  const age = medians(records, (r) => String(r.age));
  const reasons: string[] = [];
  if (role.gap !== null && role.gap > EVALUATION.fairness.maxMedianGap) reasons.push('role_gap');
  if (age.gap !== null && age.gap > EVALUATION.fairness.maxMedianGap) reasons.push('age_gap');
  return {
    ...judge(records.filter((r) => isNumber(r.overall)).length, reasons),
    byRole: role.groups,
    byAge: age.groups,
    largestRoleGap: role.gap,
    largestAgeGap: age.gap,
  };
}

// ---------------------------------------------------------------- 6. gaming

export interface GamingTest extends Judged {
  /** Share of sessions with every answer on the best option (check f9). */
  allBestShare: number | null;
  /** Share of sessions flagged for answering faster than the stems can be read (check f10). */
  fastShare: number | null;
  /** Share of sessions with data grade C. */
  gradeCShare: number | null;
}

/**
 * Gaming: how many sessions look like they were not answered in earnest?
 * Reads the flags and the grade of every record that carries them. Warns when the share with
 * check f9 is over maxAllBestShare ("all_best"), with check f10 over maxFastShare
 * ("fast_answers"), or with grade C over maxGradeCShare ("grade_c").
 */
export function gamingTest(records: readonly EvalRecord[]): GamingTest {
  const usable = records.filter((r) => r.flags !== undefined && r.grade !== undefined);
  const share = (hit: (r: EvalRecord) => boolean): number | null => (usable.length ? usable.filter(hit).length / usable.length : null);
  const allBestShare = share((r) => (r.flags as readonly FlagId[]).includes('f9'));
  const fastShare = share((r) => (r.flags as readonly FlagId[]).includes('f10'));
  const gradeCShare = share((r) => r.grade === 'C');
  const reasons: string[] = [];
  if (allBestShare !== null && allBestShare > EVALUATION.gaming.maxAllBestShare) reasons.push('all_best');
  if (fastShare !== null && fastShare > EVALUATION.gaming.maxFastShare) reasons.push('fast_answers');
  if (gradeCShare !== null && gradeCShare > EVALUATION.gaming.maxGradeCShare) reasons.push('grade_c');
  return { ...judge(usable.length, reasons), allBestShare, fastShare, gradeCShare };
}

// ---------------------------------------------------------------- 7. version effect

export interface VersionEffectTest extends Judged {
  /** Spearman rank correlation of the overall price under the two versions. */
  rankCorrelation: number | null;
  /** Share of sessions whose overall price moves by more than RECOMPUTE_MOVE_POINTS. */
  shareMoved: number | null;
  /** Mean of after minus before, in points. */
  meanShift: number | null;
  largestMove: number | null;
}

/**
 * Version effect: what does a change of algorithm, bank or norms do to prices already given?
 * Reads the overall price of the same sessions under the old and the new version. Warns when
 * the rank correlation is under minRankCorrelation ("ranks_reordered") or when more than
 * maxShareMoved of the sessions move by more than RECOMPUTE_MOVE_POINTS ("many_moved").
 */
export function versionEffectTest(pairs: readonly EvalVersionPair[]): VersionEffectTest {
  const usable = pairs.filter((p) => isNumber(p.before) && isNumber(p.after));
  const before = usable.map((p) => p.before as number);
  const after = usable.map((p) => p.after as number);
  const moves = before.map((x, i) => after[i] - x);
  const rankCorrelation = spearman(before, after);
  const shareMoved = usable.length ? moves.filter((m) => Math.abs(m) > RECOMPUTE_MOVE_POINTS).length / usable.length : null;
  const reasons: string[] = [];
  if (rankCorrelation === null || rankCorrelation < EVALUATION.versionEffect.minRankCorrelation) reasons.push('ranks_reordered');
  if (shareMoved !== null && shareMoved > EVALUATION.versionEffect.maxShareMoved) reasons.push('many_moved');
  return {
    ...judge(usable.length, reasons),
    rankCorrelation,
    shareMoved,
    meanShift: mean(moves),
    largestMove: moves.length ? Math.max(...moves.map((m) => Math.abs(m))) : null,
  };
}

/** The seven tests by name, in the order of the roadmap. */
export const SEVEN_TESTS = ['range', 'stability', 'response', 'validity', 'fairness', 'gaming', 'versionEffect'] as const;
