// What callers rely on: selection is a function of the stored steps alone, a result is data
// without wording, and the closing ladder question belongs to no sector.

import { describe, expect, it } from 'vitest';
import { compute, nextQuestion } from '../../../src/engine';
import type { Step } from '../../../src/engine';
import { backgroundFor, bank, walk } from './helpers';

describe('nextQuestion', () => {
  it('is a function of the stored steps alone: every prefix resumes at the same question', () => {
    let checked = 0;
    for (const role of bank.roles) {
      const background = backgroundFor(role.id);
      // A mix of answers and skips, including the routing questions.
      const full = walk(background, (q) => (q.index % 5 === 3 ? null : q.index % q.version.opts.length));
      for (let n = 0; n <= full.length; n++) {
        const prefix = Object.freeze(full.slice(0, n).map((s) => Object.freeze({ ...s })));
        const q = nextQuestion(bank, background, prefix);
        if (n === full.length) expect(q).toBeNull();
        else expect([q!.id, q!.key, q!.index]).toEqual([full[n].id, full[n].key, n]);
        // The order the steps are stored in does not matter.
        const reversed = [...prefix].reverse();
        expect(nextQuestion(bank, background, reversed)?.id ?? null).toBe(q?.id ?? null);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(11 * 31);
  });
});

describe('a result', () => {
  it('carries its three versions and no user-facing text', () => {
    const background = backgroundFor('seek', { money: 1 });
    const steps = walk(background, (q) => (q.index % 4 === 0 ? null : 1), { lang: 'en', secs: 0.3 });
    const result = compute({ bank, background, steps, previous: { C: 90, W: 110, N: 100, B: 100, M: 100 }, mindNotice: true });
    expect(result.versions).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
    const strings: string[] = [];
    const collect = (x: unknown): void => {
      if (typeof x === 'string') strings.push(x);
      else if (Array.isArray(x)) x.forEach(collect);
      else if (typeof x === 'object' && x !== null) Object.values(x).forEach(collect);
    };
    collect(result);
    expect(strings.length).toBeGreaterThan(50);
    // Identifiers only: no spaces, no Han characters, nothing longer than an id.
    const texty = strings.filter((s) => /\s|[一-鿿]/.test(s) || s.length > 24);
    expect(texty).toEqual([]);
  });
});

describe('the ladder question (G1) belongs to no sector', () => {
  const emp = backgroundFor('emp');
  const base = walk(emp, () => 2);
  const withLadder = (k: number | null) => compute({ bank, background: emp, steps: base.map((s): Step => (s.id === 'G1' ? { ...s, k } : s)) });

  it('moves wealth, capability, mind and network through its loads only, never body, and is nobody\'s own question', () => {
    const low = withLadder(0);
    const high = withLadder(4);
    const skipped = withLadder(null);
    for (const a of ['W', 'C', 'M', 'N'] as const) expect(high.sectors[a].price as number).toBeGreaterThan(low.sectors[a].price as number);
    expect(high.sectors.B.price).toBe(low.sectors.B.price);
    for (const a of ['W', 'C', 'M', 'N', 'B'] as const) {
      expect(skipped.sectors[a].ownItems).toBe(high.sectors[a].ownItems);
      expect(skipped.sectors[a].ownScored).toBe(high.sectors[a].ownScored);
      expect(skipped.sectors[a].status).toBe('listed');
    }
    const own = base.filter((s) => bank.items[s.id].area !== 'G').length;
    expect((['W', 'C', 'M', 'N', 'B'] as const).reduce((n, a) => n + high.sectors[a].ownItems, 0)).toBe(own);
    expect(skipped.socialPosition).toBeNull();
  });
});
