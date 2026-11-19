// Acceptance A: all 335 reference cases, each compared field by field to 1e-9.
// No case is skipped or treated specially.

import { afterAll, describe, expect, it } from 'vitest';
import golden from '../../../reference/golden_vectors.json';
import { compute, contextOf, multiplierFor, nextQuestion, progressOf, thresholdFor } from '../../../src/engine';
import type { Background, Lang, RoleId, Step, Where } from '../../../src/engine';
import { AREAS, bank, near } from './helpers';

interface GoldenStep {
  id: string;
  key: string;
  k: number;
  secs: number | null;
  where: string;
  threshold: number;
  multiplier: number;
}

interface GoldenCase {
  case: number;
  note: string;
  lang: string;
  age: number;
  role: string;
  background: Record<string, number>;
  questions: number;
  context: Record<string, string | number | null>;
  steps: GoldenStep[];
  expect: {
    raw: Record<string, number | null>;
    keep: Record<string, number | null>;
    price: Record<string, number | null>;
    priceFullWeight: Record<string, number | null>;
    overall: number;
    overallFullWeight: number;
    keepAll: number;
    interestWrong: boolean;
    grade: string;
    flagPoints: number;
    flags: string[];
    contrasts: string[];
    mindAlert: boolean;
    rank: string[];
    objectivePrice: number;
    objectiveRung: number;
    ladder: number;
    gap: number;
  };
}

const EXPECTED_CASES = 335;
const cases = golden.cases as unknown as GoldenCase[];

// The reference page records the tap position as "first", "mid" or "last".
const WHERE: Record<string, Where> = { first: 'first', mid: 'middle', last: 'last' };

/** Collects every mismatch of one case, so a failure names all of them at once. */
function check(c: GoldenCase): string[] {
  const problems: string[] = [];
  const same = (label: string, actual: unknown, expected: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  };
  const close = (label: string, actual: number | null | undefined, expected: number | null | undefined): void => {
    if (!near(actual, expected)) problems.push(`${label}: got ${actual}, expected ${expected}`);
  };

  const lang = c.lang as Lang;
  const background: Background = { age: c.age, role: c.role as RoleId, extra: c.background };

  // Question path: the engine must ask the same questions in the same versions.
  const steps: Step[] = [];
  c.steps.forEach((g, i) => {
    const q = nextQuestion(bank, background, steps);
    if (q === null) {
      problems.push(`step ${i}: questionnaire ended early, expected ${g.id}`);
      return;
    }
    same(`step ${i} id`, q.id, g.id);
    same(`step ${i} key`, q.key, g.key);
    same(`step ${i} index`, q.index, i);
    same(`step ${i} total`, q.total, c.questions);
    const threshold = thresholdFor(q.version.q[lang], lang);
    close(`step ${i} threshold`, threshold, g.threshold);
    close(`step ${i} multiplier`, multiplierFor(g.secs, threshold), g.multiplier);
    steps.push({ id: g.id, key: g.key, k: g.k, secs: g.secs, lang, where: WHERE[g.where], source: 'questionnaire' });
  });
  same('questionnaire ends', nextQuestion(bank, background, steps), null);
  same('number of questions', steps.length, c.questions);
  same('progress', progressOf(bank, background, steps), { asked: c.questions, total: c.questions, remaining: 0 });

  const result = compute({ bank, background, steps });
  const e = c.expect;

  same('context', result.context, c.context);
  same('context before answers', contextOf(bank, background), { ...c.context, tier: null, mgr: 0 });
  c.steps.forEach((g, i) => {
    const detail = result.steps[i];
    same(`detail ${i} id`, [detail?.id, detail?.key, detail?.k], [g.id, g.key, g.k]);
    close(`detail ${i} threshold`, detail?.threshold, g.threshold);
    close(`detail ${i} multiplier`, detail?.multiplier, g.multiplier);
  });
  for (const a of AREAS) {
    const sector = result.sectors[a];
    close(`raw ${a}`, sector.raw, e.raw[a]);
    close(`keep ${a}`, sector.keep, e.keep[a]);
    close(`price ${a}`, sector.price, e.price[a]);
    close(`priceFullWeight ${a}`, sector.priceFullWeight, e.priceFullWeight[a]);
    same(`status ${a}`, sector.status, e.price[a] === null ? 'insufficient' : 'listed');
  }
  close('overall', result.overall, e.overall);
  close('overallFullWeight', result.overallFullWeight, e.overallFullWeight);
  close('keepAll', result.keepAll, e.keepAll);
  same('interestWrong', result.interestWrong, e.interestWrong);
  same('flags', result.flags.map((f) => `${f.id}:${f.points}`), e.flags);
  same('flagPoints', result.flagPoints, e.flagPoints);
  same('grade', result.grade, e.grade);
  same('contrasts', result.contrasts, e.contrasts);
  same('mindAlert', result.mindAlert, e.mindAlert);
  same('rank', result.rank, e.rank);
  close('objectivePrice', result.socialPosition?.objectivePrice, e.objectivePrice);
  same('objectiveRung', result.socialPosition?.objectiveRung, e.objectiveRung);
  same('ladder', result.socialPosition?.ladder, e.ladder);
  close('gap', result.socialPosition?.gap, e.gap);
  same('versions', result.versions, { algo: 1, bank: golden.bank_version, norm: 'provisional-1' });
  return problems;
}

describe('golden vectors', () => {
  let checked = 0;

  it('the file holds 335 cases for bank 2.1', () => {
    expect(golden.count).toBe(EXPECTED_CASES);
    expect(cases).toHaveLength(EXPECTED_CASES);
    expect(new Set(cases.map((c) => c.case)).size).toBe(EXPECTED_CASES);
    expect(golden.bank_version).toBe(bank.bank_version);
  });

  it.each(cases.map((c) => [c.case, c.role, c.note || 'no note', c] as const))(
    'case %i (%s, %s)',
    (_n, _role, _note, c) => {
      expect(check(c)).toEqual([]);
      checked++;
    },
  );

  it('the comparison itself notices a difference of 1e-8 and a changed label', () => {
    const tampered = (change: (c: GoldenCase) => void): string[] => {
      const copy = JSON.parse(JSON.stringify(cases[0])) as GoldenCase;
      change(copy);
      return check(copy);
    };
    expect(tampered(() => undefined)).toEqual([]);
    expect(tampered((c) => (c.expect.price.C = (c.expect.price.C as number) + 1e-8))).toHaveLength(1);
    expect(tampered((c) => (c.expect.raw.M = (c.expect.raw.M as number) - 1e-8))).toHaveLength(1);
    expect(tampered((c) => (c.expect.overall += 1e-8))).toHaveLength(1);
    expect(tampered((c) => (c.steps[3].threshold += 1e-8)).length).toBeGreaterThan(0);
    expect(tampered((c) => (c.steps[1].key = 'grad')).length).toBeGreaterThan(0);
    expect(tampered((c) => (c.steps[2].k = 0)).length).toBeGreaterThan(0);
    expect(tampered((c) => (c.expect.flags = []))).toHaveLength(1);
    expect(tampered((c) => (c.expect.grade = 'B'))).toHaveLength(1);
    expect(tampered((c) => (c.expect.rank = ['M', 'B', 'N', 'W', 'C']))).toHaveLength(1);
    expect(tampered((c) => (c.expect.gap += 1))).toHaveLength(1);
    expect(tampered((c) => (c.context.tier = 'low'))).toHaveLength(1);
  });

  it('checked every case', () => {
    expect(checked).toBe(EXPECTED_CASES);
  });

  afterAll(() => {
    // Fails loudly when a filter or an early return left cases unchecked.
    expect(checked).toBe(EXPECTED_CASES);
  });
});
