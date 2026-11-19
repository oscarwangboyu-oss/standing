// The seven scoring tests on small hand-made data: range, stability, response, validity,
// fairness, gaming, version effect. Each returns numbers and a verdict.

import { describe, expect, it } from 'vitest';
import {
  EVALUATION,
  RECOMPUTE_MOVE_POINTS,
  SEVEN_TESTS,
  changedAnswers,
  fairnessTest,
  gamingTest,
  mean,
  median,
  pearson,
  quantile,
  rangeTest,
  ranks,
  responseTest,
  spearman,
  stabilityTest,
  standardDeviation,
  validityTest,
  versionEffectTest,
} from '../../../src/engine';
import type { EvalAnswer, EvalPair, EvalRecord } from '../../../src/engine';

const N = EVALUATION.minRecords;
const count = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const record = (overall: number | null, more: Partial<EvalRecord> = {}): EvalRecord => ({
  role: 'emp',
  age: 2,
  overall,
  sectors: { C: overall, W: overall, N: overall, B: overall, M: overall },
  ...more,
});

describe('statistics', () => {
  it('mean, standard deviation, median and quantiles', () => {
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(mean([])).toBeNull();
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(standardDeviation([5])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([10, 20], 0.05)).toBeCloseTo(10.5, 12);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('Pearson and Spearman correlation, with ties ranked at their mean', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    expect(pearson([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.8, 12);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2]);
    // Monotone and not linear: rank correlation 1, Pearson below 1.
    expect(spearman([1, 2, 3, 4], [1, 10, 100, 1000])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [1, 10, 100, 1000]) as number).toBeLessThan(0.9);
  });

  it('there are seven tests', () => {
    expect(SEVEN_TESTS).toEqual(['range', 'stability', 'response', 'validity', 'fairness', 'gaming', 'versionEffect']);
  });
});

describe('1. range', () => {
  it('reports the spread of the overall price and the share of sector prices at the limits', () => {
    // 30 prices from 85.5 to 114.5 in steps of 1.
    const spread = rangeTest(count(N).map((i) => record(85.5 + i)));
    expect(spread).toMatchObject({ verdict: 'pass', reasons: [], n: 30, sectorPrices: 150, shareAtLimitDown: 0, shareAtLimitUp: 0 });
    expect(spread.overall).toMatchObject({ min: 85.5, max: 114.5, median: 100, mean: 100 });
    expect(spread.overall.sd).toBeCloseTo(Math.sqrt((30 * 31) / 12), 12);
  });

  it('warns when everyone gets nearly the same price, or when prices pile up at 55 and 145', () => {
    expect(rangeTest(count(N).map((i) => record(100 + (i % 2)))).reasons).toEqual(['narrow_spread']);
    // 3 of 30 people with every sector at a limit: 10% of sector prices.
    const pinned = rangeTest(count(N).map((i) => record(i < 2 ? 145 : i < 3 ? 55 : 80 + i)));
    expect(pinned.shareAtLimitUp).toBeCloseTo(2 / 30, 12);
    expect(pinned.shareAtLimitDown).toBeCloseTo(1 / 30, 12);
    expect(pinned).toMatchObject({ verdict: 'warn', reasons: ['at_limits'] });
    // Other limits can be passed in.
    expect(rangeTest(count(N).map((i) => record(85.5 + i)), { min: 90, max: 110 }).reasons).toEqual(['at_limits']);
  });

  it('gives numbers and no verdict below 30 records, and leaves out records without a price', () => {
    const few = rangeTest([record(90), record(110), record(null, { sectors: {} })]);
    expect(few).toMatchObject({ verdict: 'insufficient_data', n: 2, sectorPrices: 10 });
    expect(few.overall.mean).toBe(100);
    expect(rangeTest([]).overall).toEqual({ min: null, p5: null, median: null, p95: null, max: null, mean: null, sd: null });
  });
});

describe('2. stability', () => {
  const pair = (first: number | null, second: number | null): EvalPair => ({ first: { overall: first }, second: { overall: second }, daysApart: 14 });

  it('is the correlation of the overall price between two checks of the same people', () => {
    const steady = stabilityTest(count(N).map((i) => pair(80 + i, 80 + i + (i % 2 ? 1 : -1))));
    expect(steady.correlation as number).toBeGreaterThan(0.98);
    expect(steady).toMatchObject({ verdict: 'pass', n: 30, meanAbsoluteChange: 1 });
    expect(EVALUATION.stability.minRetestCorrelation).toBe(0.75);
  });

  it('warns under 0.75, and reports without a verdict below 30 pairs', () => {
    const shuffled = stabilityTest(count(N).map((i) => pair(80 + i, 80 + ((i * 7) % 30))));
    expect(shuffled.correlation as number).toBeLessThan(0.75);
    expect(shuffled).toMatchObject({ verdict: 'warn', reasons: ['low_retest_correlation'] });
    const few = stabilityTest([pair(90, 92), pair(100, 99), pair(110, 113), pair(null, 100)]);
    expect(few).toMatchObject({ verdict: 'insufficient_data', n: 3, meanAbsoluteChange: 2 });
    expect(few.correlation).toBeCloseTo(pearson([90, 100, 110], [92, 99, 113]) as number, 12);
  });
});

describe('3. response', () => {
  const answers = (ks: Array<number | null>, key = 'base'): EvalAnswer[] => ks.map((k, i) => ({ id: `Q${i}`, key, k }));
  const pair = (first: Array<number | null>, second: Array<number | null>, from: number, to: number): EvalPair => ({
    first: { overall: from, steps: answers(first) },
    second: { overall: to, steps: answers(second) },
  });

  it('counts a changed answer when the same wording got another option', () => {
    expect(changedAnswers(answers([0, 1, 2, 3]), answers([0, 2, 2, 0]))).toBe(2);
    // A skip on either side is not a changed answer, nor is another wording of the question.
    expect(changedAnswers(answers([0, null, 2]), answers([null, 1, 2]))).toBe(0);
    expect(changedAnswers(answers([0, 1], 'base'), answers([1, 0], 'high'))).toBe(0);
    expect(changedAnswers(answers([0, 1]), answers([1]))).toBe(1);
  });

  it('is the absolute change of the overall price per changed answer', () => {
    // 3 changed answers and 1.5 points, 1 changed answer and 0.5 points: 2 points over 4 answers.
    const two = responseTest([pair([0, 0, 0, 0], [1, 1, 1, 0], 100, 101.5), pair([0, 0, 0, 0], [0, 0, 0, 2], 100, 99.5), pair([1, 1], [1, 1], 100, 104)]);
    expect(two).toMatchObject({ verdict: 'insufficient_data', n: 2, changedAnswers: 4, pointsPerChangedAnswer: 0.5, shareUnmoved: 0 });
    const usual = responseTest(count(N).map((i) => pair([0, 0, 0], [1, 1, 0], 100, 100 + (i % 2 ? 0.8 : -0.8))));
    expect(usual).toMatchObject({ verdict: 'pass', n: 30, changedAnswers: 60, shareUnmoved: 0 });
    expect(usual.pointsPerChangedAnswer).toBeCloseTo(0.4, 12);
  });

  it('warns when the price does not react, and when single answers move it too far', () => {
    const dead = responseTest(count(N).map(() => pair([0, 0], [1, 1], 100, 100)));
    expect(dead).toMatchObject({ verdict: 'warn', reasons: ['unresponsive'], pointsPerChangedAnswer: 0, shareUnmoved: 1 });
    const wild = responseTest(count(N).map(() => pair([0, 0], [1, 0], 100, 110)));
    expect(wild).toMatchObject({ verdict: 'warn', reasons: ['jumpy'], pointsPerChangedAnswer: 10 });
  });
});

describe('4. validity', () => {
  it('objective position against the ladder, and each pair of sectors', () => {
    // Ladder option rises with the objective price; the five sectors vary on their own.
    const records = count(N).map((i) =>
      record(100, {
        objectivePrice: 80 + i,
        ladder: Math.floor(i / 6),
        sectors: { C: 80 + i, W: 80 + ((i * 7) % 30), N: 80 + ((i * 11) % 30), B: 80 + ((i * 13) % 30), M: 80 + ((i * 17) % 30) },
      }),
    );
    const v = validityTest(records);
    expect(v.ladderCorrelation as number).toBeGreaterThan(0.95);
    expect(v).toMatchObject({ verdict: 'pass', reasons: [], n: 30, ladderRecords: 30 });
    expect(Object.keys(v.sectorCorrelations)).toEqual(['C-W', 'C-N', 'C-B', 'C-M', 'W-N', 'W-B', 'W-M', 'N-B', 'N-M', 'B-M']);
    expect(v.sectorCorrelations['C-W']).toBeCloseTo(pearson(records.map((r) => r.sectors.C as number), records.map((r) => r.sectors.W as number)) as number, 12);
    expect(v.highestSectorCorrelation).toBe(Math.max(...(Object.values(v.sectorCorrelations) as number[])));
  });

  it('warns when the ladder is unrelated to the objective position, and when two sectors move as one', () => {
    const unrelated = validityTest(count(N).map((i) => record(100, { objectivePrice: 80 + i, ladder: (i * 7) % 5, sectors: { C: 80 + i, W: 110 - i } })));
    expect(unrelated.ladderCorrelation as number).toBeLessThan(0.15);
    expect(unrelated.reasons).toEqual(['ladder_unrelated']);
    expect(unrelated.sectorCorrelations['C-W']).toBeCloseTo(-1, 12);
    expect(unrelated.sectorCorrelations['B-M']).toBeNull();
    const overlap = validityTest(count(N).map((i) => record(100, { objectivePrice: 80 + i, ladder: Math.floor(i / 6), sectors: { C: 80 + i, W: 81 + i * 1.1 } })));
    expect(overlap).toMatchObject({ verdict: 'warn', reasons: ['sectors_overlap'] });
    // Records without a ladder answer are left out of the ladder check.
    expect(validityTest([record(100, { objectivePrice: 100, ladder: null }), record(90)])).toMatchObject({ verdict: 'insufficient_data', ladderRecords: 0, ladderCorrelation: null });
  });
});

describe('5. fairness', () => {
  const group = (role: string, age: number, prices: number[]): EvalRecord[] => prices.map((p) => record(p, { role, age }));
  const around = (centre: number): number[] => [-4, -3, -2, -1, 0, 0, 1, 2, 3, 4].map((d) => centre + d);

  it('compares the median overall price of the roles, and of the age bands', () => {
    const records = [...group('emp', 1, around(100)), ...group('ug4', 1, around(104)), ...group('free', 2, around(98))];
    const f = fairnessTest(records);
    expect(f.byRole).toEqual([
      { group: 'emp', n: 10, median: 100, counted: true },
      { group: 'free', n: 10, median: 98, counted: true },
      { group: 'ug4', n: 10, median: 104, counted: true },
    ]);
    expect(f.byAge).toEqual([
      { group: '1', n: 20, median: 102, counted: true },
      { group: '2', n: 10, median: 98, counted: true },
    ]);
    expect(f).toMatchObject({ verdict: 'pass', n: 30, largestRoleGap: 6, largestAgeGap: 4 });
  });

  it('warns when the gap is over 7.5 points, and leaves groups under 10 people out of the gap', () => {
    expect(EVALUATION.fairness).toEqual({ minGroupSize: 10, maxMedianGap: 7.5 });
    const apart = fairnessTest([...group('emp', 1, around(100)), ...group('ug4', 2, around(109)), ...group('free', 1, around(101))]);
    expect(apart).toMatchObject({ verdict: 'warn', reasons: ['role_gap', 'age_gap'], largestRoleGap: 9, largestAgeGap: 8.5 });
    // A gap of exactly 7.5 points is not over the line.
    const onTheLine = fairnessTest([...group('emp', 1, around(100)), ...group('ug4', 1, around(107.5)), ...group('free', 1, around(101))]);
    expect(onTheLine).toMatchObject({ verdict: 'pass', largestRoleGap: 7.5 });
    const small = fairnessTest([...group('emp', 1, around(100)), ...group('ug4', 1, around(103)), ...group('free', 1, around(101)), ...group('owner', 1, [140, 141, 142])]);
    expect(small.byRole.find((g) => g.group === 'owner')).toEqual({ group: 'owner', n: 3, median: 141, counted: false });
    expect(small).toMatchObject({ verdict: 'pass', largestRoleGap: 3, largestAgeGap: null });
  });
});

describe('6. gaming', () => {
  const sessions = (total: number, allBest: number, fast: number, gradeC: number): EvalRecord[] =>
    count(total).map((i) =>
      record(100, {
        flags: [...(i < allBest ? (['f9'] as const) : []), ...(i >= total - fast ? (['f10'] as const) : [])],
        grade: i >= total - gradeC ? 'C' : 'A',
      }),
    );

  it('reports the share of sessions with the all-best flag, the fast-answer flag, and grade C', () => {
    const calm = gamingTest(sessions(100, 1, 5, 2));
    expect(calm).toEqual({ verdict: 'pass', reasons: [], n: 100, allBestShare: 0.01, fastShare: 0.05, gradeCShare: 0.02 });
  });

  it('warns for each share over its line', () => {
    expect(EVALUATION.gaming).toEqual({ maxAllBestShare: 0.02, maxFastShare: 0.1, maxGradeCShare: 0.05 });
    expect(gamingTest(sessions(100, 3, 5, 2)).reasons).toEqual(['all_best']);
    expect(gamingTest(sessions(100, 0, 11, 2)).reasons).toEqual(['fast_answers']);
    expect(gamingTest(sessions(100, 3, 20, 6))).toMatchObject({ verdict: 'warn', reasons: ['all_best', 'fast_answers', 'grade_c'] });
    // Records without flags and grade are left out.
    expect(gamingTest([record(100), ...sessions(4, 1, 0, 0)])).toMatchObject({ verdict: 'insufficient_data', n: 4, allBestShare: 0.25 });
  });
});

describe('7. version effect', () => {
  it('is the rank correlation between two versions and the share that moves more than 5 points', () => {
    expect(RECOMPUTE_MOVE_POINTS).toBe(5);
    const close = versionEffectTest(count(N).map((i) => ({ before: 80 + i, after: 80 + i + (i % 3) - 1 })));
    expect(close.rankCorrelation as number).toBeGreaterThan(0.98);
    expect(close).toMatchObject({ verdict: 'pass', n: 30, shareMoved: 0, meanShift: 0, largestMove: 1 });
  });

  it('warns when many people move, or when the order of people changes', () => {
    // Everyone up 6 points: the order is untouched and everyone moved.
    const shifted = versionEffectTest(count(N).map((i) => ({ before: 80 + i, after: 86 + i })));
    expect(shifted.rankCorrelation).toBeCloseTo(1, 12);
    expect(shifted).toMatchObject({ verdict: 'warn', reasons: ['many_moved'], shareMoved: 1, meanShift: 6 });
    // Exactly 5 points is not "more than 5".
    expect(versionEffectTest(count(N).map((i) => ({ before: 80 + i, after: 85 + i }))).shareMoved).toBe(0);
    const reversed = versionEffectTest(count(N).map((i) => ({ before: 98 + i * 0.1, after: 101 - i * 0.1 })));
    expect(reversed.rankCorrelation).toBeCloseTo(-1, 12);
    expect(reversed.reasons).toEqual(['ranks_reordered']);
    expect(versionEffectTest([{ before: 100, after: null }, { before: 100, after: 101 }])).toMatchObject({ verdict: 'insufficient_data', n: 1 });
  });
});
