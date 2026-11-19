// Acceptance E (part): health consent declined. With excludedAreas ["B", "M"] the body and
// mind questions are never asked and the two sectors are unlisted.

import { describe, expect, it } from 'vitest';
import { compute, nextQuestion, progressOf } from '../../../src/engine';
import type { AreaId, Step } from '../../../src/engine';
import { AREAS, backgroundFor, bank, chooseBest, chooseWorst, situations, walk, withAnswer } from './helpers';

const HEALTH: AreaId[] = ['B', 'M'];
const opts = { excludedAreas: HEALTH };
const emp = backgroundFor('emp');

describe('questions of excluded sectors are never asked', () => {
  it('in every situation', () => {
    for (const { background } of situations()) {
      const full = walk(background, () => 2);
      const steps = walk(background, () => 2, opts);
      const sections = steps.map((s) => bank.items[s.id].area);
      expect(sections).not.toContain('B');
      expect(sections).not.toContain('M');
      // Exactly the body and mind questions are gone: 5 and 6. The ladder question stays.
      expect(steps.map((s) => [s.id, s.key])).toEqual(
        full.filter((s) => !HEALTH.includes(bank.items[s.id].area as AreaId)).map((s) => [s.id, s.key]),
      );
      expect(steps.length).toBe(full.length - 11);
      expect(steps[steps.length - 1].id).toBe('G1');
      expect(progressOf(bank, background, [], opts).total).toBe(full.length - 11);
    }
  });

  it('the progress counts only the questions that will be asked', () => {
    const first = nextQuestion(bank, emp, [], opts);
    expect(first).toMatchObject({ index: 0, total: 23 });
    const steps = walk(emp, () => 2, opts);
    expect(progressOf(bank, emp, steps.slice(0, 10), opts)).toEqual({ asked: 10, total: 23, remaining: 13 });
    expect(nextQuestion(bank, emp, steps, opts)).toBeNull();
    // Without the option the same steps are an unfinished questionnaire: body comes next.
    expect(nextQuestion(bank, emp, steps)?.id).toBe('B1');
  });
});

describe('result with body and mind excluded', () => {
  const steps = walk(emp, () => 2, opts);
  const result = compute({ bank, background: emp, steps, ...opts });

  it('the two sectors are unlisted and the other three are priced', () => {
    for (const a of HEALTH) {
      expect(result.sectors[a]).toEqual({
        status: 'unlisted',
        price: null,
        priceFullWeight: null,
        keep: null,
        raw: null,
        ownItems: 0,
        ownScored: 0,
      });
    }
    for (const a of ['C', 'W', 'N'] as const) expect(result.sectors[a].status).toBe('listed');
  });

  it('the overall price is the mean of the remaining priced sectors', () => {
    const mean = ((result.sectors.C.price as number) + (result.sectors.W.price as number) + (result.sectors.N.price as number)) / 3;
    expect(result.overall).toBeCloseTo(mean, 12);
    expect(result.overallCovers).toEqual(['C', 'W', 'N']);
    expect(result.overallLeftOut).toEqual(['B', 'M']);
    expect(result.rank.slice().sort()).toEqual(['C', 'N', 'W']);
    expect(result.market.pricedCount).toBe(3);
    expect(result.market.tags.B).toBeNull();
    expect(result.market.tags.M).toBeNull();
    expect(result.counts).toEqual({ total: 23, answered: 23, skipped: 0 });
  });

  it('the best answers still give 137.50 in the three listed sectors', () => {
    const best = compute({ bank, background: emp, steps: walk(emp, chooseBest, opts), ...opts });
    for (const a of ['C', 'W', 'N'] as const) expect(best.sectors[a].price).toBeCloseTo(137.5, 9);
    expect(best.overall).toBeCloseTo(137.5, 9);
    expect(best.flags).toEqual([{ id: 'f9', points: 1 }]);
  });

  it('the ladder is still asked, so social position is still given', () => {
    expect(result.socialPosition).not.toBeNull();
    expect(result.socialPosition?.ladder).toBe(2);
  });

  it('two priced sectors are not enough for an overall price', () => {
    const skipNetwork = steps.map((s): Step => (bank.items[s.id].area === 'N' ? { ...s, k: null } : s));
    const two = compute({ bank, background: emp, steps: skipNetwork, ...opts });
    expect(two.overall).toBeNull();
    expect(two.overallLeftOut).toEqual(['N', 'B', 'M']);
    expect(two.sectors.N.status).toBe('insufficient');
    expect(two.sectors.B.status).toBe('unlisted');
  });
});

describe('nothing that depends on body or mind fires', () => {
  // A full questionnaire whose body and mind answers would fire f1, f2, f8, the contrasts c4
  // and c6 and the mind notice. Scored with the two sectors excluded, those answers must not
  // count for anything.
  let full = walk(emp, chooseBest);
  const loud: Record<string, number> = { B1: 4, B5: 0, B2: 0, B4: 5, M1: 4, M4: 0, M3: 0, M2: 0, M5: 0, M6: 0 };
  for (const [id, k] of Object.entries(loud)) full = withAnswer(full, id, k);

  it('with the sectors listed, they do fire', () => {
    const listed = compute({ bank, background: emp, steps: full });
    expect(listed.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['f1', 'f2', 'f8']));
    expect(listed.mindAlert).toBe(true);
    expect(listed.contrasts).toContain('c6a');
  });

  it('with the sectors excluded, they do not, and stray body and mind steps are ignored', () => {
    const excluded = compute({ bank, background: emp, steps: full, ...opts });
    const ids = excluded.flags.map((f) => f.id);
    for (const f of ['f1', 'f2', 'f8']) expect(ids).not.toContain(f);
    expect(excluded.mindAlert).toBe(false);
    expect(excluded.contrasts.filter((c) => c.startsWith('c4') || c.startsWith('c6'))).toEqual([]);
    expect(excluded.steps.map((s) => s.section)).not.toContain('B');
    expect(excluded.steps.map((s) => s.section)).not.toContain('M');
    expect(excluded.market.laggard).not.toBe('M');

    // Same result as a session in which those questions were never shown.
    const never = full.filter((s) => !HEALTH.includes(bank.items[s.id].area as AreaId));
    expect(excluded).toEqual(compute({ bank, background: emp, steps: never, ...opts }));
    // The remaining answers are all the best ones, so f9 is the only check left.
    expect(excluded.flags).toEqual([{ id: 'f9', points: 1 }]);
  });

  it('body and mind answers do not leak into the other sectors through their loads', () => {
    const lowHealth = compute({ bank, background: emp, steps: full, ...opts });
    const highHealth = compute({ bank, background: emp, steps: walk(emp, chooseBest), ...opts });
    for (const a of ['C', 'W', 'N'] as const) expect(lowHealth.sectors[a]).toEqual(highHealth.sectors[a]);
  });

  it('an extra for an excluded sector is not counted', () => {
    const extra = { id: 'daily_state', area: 'M' as AreaId, load: { M: 1, W: 1 }, score: 0, source: 'daily_open' as const };
    const withExtra = compute({ bank, background: emp, steps: full, ...opts, extras: [extra] });
    const without = compute({ bank, background: emp, steps: full, ...opts });
    expect(withExtra.extras).toEqual([{ id: 'daily_state', area: 'M', source: 'daily_open', counted: false }]);
    expect(withExtra.sectors).toEqual(without.sectors);
  });

  it('an override of an excluded question is ignored', () => {
    const overridden = compute({ bank, background: emp, steps: full, ...opts, overrides: [{ itemId: 'B3', k: 0, source: 'daily_open' }] });
    expect(overridden).toEqual(compute({ bank, background: emp, steps: full, ...opts, overrides: [] }));
  });
});

describe('any set of excluded sectors leaves a questionnaire that can be walked', () => {
  const subsets: AreaId[][] = [];
  for (let mask = 1; mask < 1 << AREAS.length; mask++) subsets.push(AREAS.filter((_, i) => mask & (1 << i)));

  it('all 31 subsets, every situation', () => {
    expect(subsets).toHaveLength(31);
    for (const excludedAreas of subsets) {
      for (const { background, money } of situations()) {
        const steps = walk(background, chooseWorst, { excludedAreas });
        expect(steps.every((s) => !excludedAreas.includes(bank.items[s.id].area as AreaId))).toBe(true);
        const result = compute({ bank, background, steps, excludedAreas });
        for (const a of excludedAreas) expect(result.sectors[a].status).toBe('unlisted');
        // A routing question that is never asked leaves the same defaults as a skipped one.
        if (excludedAreas.includes('W')) expect(result.context.tier).toBe(money === 'sup' ? 'sup' : 'mid');
        if (excludedAreas.includes('C')) expect(result.context.mgr).toBe(0);
      }
    }
  });
});
