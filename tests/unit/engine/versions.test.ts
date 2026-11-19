// Versions: a second algorithm version beside version 1 gives different results on the same
// stored steps, and the results of version 1 stay exactly reproducible. Also: the reason kept
// on a step without an answer (skipped, or marked not applicable) does not touch scoring.

import { describe, expect, it } from 'vitest';
import golden from '../../../reference/golden_vectors.json';
import {
  ALGOS,
  ALGO_PARAMS,
  CURRENT,
  EngineError,
  SKIP_REASONS,
  TEST_VARIANT,
  compute,
  createTestVariantAlgo,
  getAlgo,
  nextQuestion,
  progressOf,
  registerAlgo,
  versionEffectTest,
} from '../../../src/engine';
import type { Background, RoleId, Step, Where } from '../../../src/engine';
import { AREAS, backgroundFor, bank, near, walk } from './helpers';

describe('the test-only variant', () => {
  const sessions = bank.roles.map((role, r) => {
    const background = backgroundFor(role.id);
    return { background, steps: walk(background, (q) => (q.index * (r + 2) + r) % q.version.opts.length, { secs: 1.5 }) };
  });
  const before = sessions.map((s) => compute({ bank, ...s }));
  const variant = registerAlgo(createTestVariantAlgo());

  it('is version 1 with one value changed, under a number the app never uses', () => {
    expect(TEST_VARIANT).toEqual({ version: 9001, ownShare: 0.5, otherShare: 0.5 });
    expect(variant.version).toBe(9001);
    expect(ALGO_PARAMS[1].sector).toMatchObject({ ownShare: 2 / 3, otherShare: 1 / 3 });
    expect(Object.keys(ALGO_PARAMS)).toEqual(['1']);
    expect(CURRENT.algo).toBe(1);
    // The rules for live data are the ones of version 1.
    expect(variant.live).toEqual(getAlgo(1).live);
    expect(() => registerAlgo(createTestVariantAlgo())).toThrow(EngineError);
    expect(createTestVariantAlgo(9002).version).toBe(9002);
  });

  it('two versions give different results on the same steps', () => {
    let moved = 0;
    const pairs = sessions.map((s, i) => {
      const changed = compute({ bank, ...s, versions: { algo: variant.version } });
      expect(changed.versions).toEqual({ algo: 9001, bank: '2.1', norm: 'provisional-1' });
      // The same questions and answers went in.
      expect(changed.steps.map((d) => [d.id, d.key, d.k])).toEqual(before[i].steps.map((d) => [d.id, d.key, d.k]));
      if (AREAS.some((a) => !near(changed.sectors[a].price, before[i].sectors[a].price))) moved++;
      return { before: before[i].overall, after: changed.overall };
    });
    expect(moved).toBe(sessions.length);
    const effect = versionEffectTest(pairs);
    expect(effect.n).toBe(11);
    expect(effect.largestMove as number).toBeGreaterThan(0.1);
    expect(effect.rankCorrelation as number).toBeGreaterThan(0.5);
  });

  it('the results of version 1 are what they were before the variant was registered', () => {
    sessions.forEach((s, i) => {
      expect(compute({ bank, ...s })).toEqual(before[i]);
      expect(compute({ bank, ...s, versions: { algo: 1 } })).toEqual(before[i]);
    });
    expect(Object.keys(ALGOS).map(Number).sort((x, y) => x - y)).toEqual([1, 9001]);
  });

  it('the reference cases still score to 1e-9 under version 1 with the variant registered, and differ under it', () => {
    const where: Record<string, Where> = { first: 'first', mid: 'middle', last: 'last' };
    const cases = (golden.cases as unknown as Array<{
      lang: 'zh' | 'en';
      age: number;
      role: RoleId;
      background: Record<string, number>;
      steps: Array<{ id: string; key: string; k: number; secs: number | null; where: string }>;
      expect: { price: Record<string, number | null>; overall: number };
    }>).slice(0, 40);
    let differ = 0;
    for (const c of cases) {
      const background: Background = { age: c.age, role: c.role, extra: c.background };
      const steps: Step[] = c.steps.map((s) => ({ id: s.id, key: s.key, k: s.k, secs: s.secs, lang: c.lang, where: where[s.where], source: 'questionnaire' }));
      const old = compute({ bank, background, steps, versions: { algo: 1 } });
      for (const a of AREAS) expect(near(old.sectors[a].price, c.expect.price[a])).toBe(true);
      expect(near(old.overall, c.expect.overall)).toBe(true);
      const next = compute({ bank, background, steps, versions: { algo: variant.version } });
      if (!near(next.overall, c.expect.overall)) differ++;
    }
    expect(differ).toBeGreaterThan(30);
  });
});

describe('skipped and not applicable', () => {
  const emp = backgroundFor('emp');
  const answered = walk(emp, (q) => (q.index % 4 === 1 ? null : 2));
  const mark = (reason: 'skip' | 'na' | undefined): Step[] =>
    answered.map((s): Step => (s.k === null && reason ? { ...s, reason } : s));

  it('both are k: null for scoring, and the reason survives on the stored step', () => {
    expect(SKIP_REASONS).toEqual(['skip', 'na']);
    const plain = compute({ bank, background: emp, steps: mark(undefined) });
    const skipped = compute({ bank, background: emp, steps: mark('skip') });
    const notApplicable = compute({ bank, background: emp, steps: mark('na') });
    expect(plain.counts.skipped).toBeGreaterThan(5);
    expect(skipped).toEqual(plain);
    expect(notApplicable).toEqual(plain);
    const stored: Step[] = JSON.parse(JSON.stringify(mark('na')));
    expect(stored.filter((s) => s.reason === 'na')).toHaveLength(plain.counts.skipped);
    expect(stored.filter((s) => s.k !== null).every((s) => s.reason === undefined)).toBe(true);
  });

  it('selection does not read it either, including on the routing questions', () => {
    const routing = walk(emp, (q) => (q.id === 'W1' || q.id === 'C_lvl' ? null : 1));
    const asNa = routing.map((s): Step => (s.k === null ? { ...s, reason: 'na' } : s));
    expect(compute({ bank, background: emp, steps: asNa })).toEqual(compute({ bank, background: emp, steps: routing }));
    for (let n = 0; n < routing.length; n++) {
      expect(nextQuestion(bank, emp, asNa.slice(0, n))).toEqual(nextQuestion(bank, emp, routing.slice(0, n)));
    }
    expect(progressOf(bank, emp, asNa)).toEqual(progressOf(bank, emp, routing));
  });
});
