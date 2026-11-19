/**
 * The seven scoring tests as the command prints them. Loading and running live in
 * src/server/team/tests.ts, which the team dashboard shares (GET /api/team/tests); this file
 * re-exports them and adds the text output of `npm run eval`.
 */
import { RETEST_WINDOW_DAYS, SEVEN_TESTS } from '../../src/engine';
import type { EvalData, SevenTestResults } from '../../src/server/team/tests';

export { loadEvalData, runSevenTests } from '../../src/server/team/tests';
export type { EvalData, EvalOptions, SevenTestResults } from '../../src/server/team/tests';

const num = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined ? 'n/a' : value.toFixed(digits);
const pct = (value: number | null | undefined): string => (value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`);

const TITLES: Record<(typeof SEVEN_TESTS)[number], string> = {
  range: '1. Range',
  stability: '2. Stability',
  response: '3. Response',
  validity: '4. Validity',
  fairness: '5. Fairness',
  gaming: '6. Gaming',
  versionEffect: '7. Version effect',
};

/** The seven tests as the command prints them: a verdict, the count behind it, and the numbers. */
export function formatSevenTests(data: EvalData, results: SevenTestResults): string {
  const lines: string[] = [];
  if (data.demoPeople > 0) {
    lines.push(`SIMULATED DATA: ${data.demoPeople} of ${data.people} people are demo rows. These numbers are not real.`);
  }
  lines.push(`Completed checks: ${data.checks} from ${data.people} people`);
  lines.push(`Retest pairs ${RETEST_WINDOW_DAYS.min} to ${RETEST_WINDOW_DAYS.max} days apart: ${data.retestPairs.length}. Consecutive pairs: ${data.consecutivePairs.length}`);
  const head = (name: (typeof SEVEN_TESTS)[number]) => {
    const t = results[name];
    const reasons = t.reasons.length > 0 ? ` (${t.reasons.join(', ')})` : '';
    lines.push('');
    lines.push(`${TITLES[name]}: ${t.verdict}${reasons}, n = ${t.n}`);
  };

  head('range');
  const o = results.range.overall;
  lines.push(`  overall price: min ${num(o.min)}, 5th percentile ${num(o.p5)}, median ${num(o.median)}, 95th percentile ${num(o.p95)}, max ${num(o.max)}`);
  lines.push(`  mean ${num(o.mean)}, standard deviation ${num(o.sd)}`);
  lines.push(`  sector prices: ${results.range.sectorPrices}; at limit down ${pct(results.range.shareAtLimitDown)}, at limit up ${pct(results.range.shareAtLimitUp)}`);

  head('stability');
  lines.push(`  retest correlation of the overall price: ${num(results.stability.correlation, 4)}`);
  lines.push(`  mean absolute change: ${num(results.stability.meanAbsoluteChange)} points`);

  head('response');
  lines.push(`  changed answers: ${results.response.changedAnswers}`);
  lines.push(`  points per changed answer: ${num(results.response.pointsPerChangedAnswer, 3)}`);
  lines.push(`  pairs with a changed answer and no move: ${pct(results.response.shareUnmoved)}`);

  head('validity');
  lines.push(`  objective position against the ladder (Spearman): ${num(results.validity.ladderCorrelation, 4)} over ${results.validity.ladderRecords} checks`);
  lines.push(`  highest correlation between two sectors: ${num(results.validity.highestSectorCorrelation, 4)}`);
  lines.push(`  sector pairs: ${Object.entries(results.validity.sectorCorrelations).map(([pair, r]) => `${pair} ${num(r, 2)}`).join(', ')}`);

  head('fairness');
  lines.push(`  largest gap between role medians: ${num(results.fairness.largestRoleGap)} points`);
  lines.push(`  by role (median, n): ${results.fairness.byRole.map((g) => `${g.group} ${num(g.median)} (${g.n}${g.counted ? '' : ', too few'})`).join(', ')}`);
  lines.push(`  largest gap between age band medians: ${num(results.fairness.largestAgeGap)} points`);
  lines.push(`  by age band (median, n): ${results.fairness.byAge.map((g) => `${g.group} ${num(g.median)} (${g.n}${g.counted ? '' : ', too few'})`).join(', ')}`);

  head('gaming');
  lines.push(`  every answer on the best option: ${pct(results.gaming.allBestShare)}`);
  lines.push(`  answered faster than the stems can be read: ${pct(results.gaming.fastShare)}`);
  lines.push(`  data grade C: ${pct(results.gaming.gradeCShare)}`);

  head('versionEffect');
  if (data.versionComparison === null) {
    lines.push('  nothing to compare: no check has a stored result under a second version.');
    lines.push('  Run again with --algo N to compare the versions in force with algorithm N.');
  } else {
    lines.push(`  ${data.versionComparison}`);
    lines.push(`  rank correlation (Spearman): ${num(results.versionEffect.rankCorrelation, 4)}`);
    lines.push(`  share moving more than the threshold: ${pct(results.versionEffect.shareMoved)}`);
    lines.push(`  mean shift: ${num(results.versionEffect.meanShift)} points; largest move: ${num(results.versionEffect.largestMove)} points`);
  }
  return lines.join('\n');
}
