// "Why it moved" (PROMPT.md section 8): every change of a price is broken down to the points
// each changed answer added, and the lines add up to the change, to 1e-9.

import { describe, expect, it } from 'vitest';
import {
  AREA_IDS,
  BREAKDOWN,
  addDays,
  breakdown,
  compute,
  createTestVariantAlgo,
  explainDays,
  registerAlgo,
  timeline,
} from '../../../src/engine';
import type { Breakdown, ComputeInput, DailyEntry, Extra, Override, PriceBreakdown, Step } from '../../../src/engine';
import { backgroundFor, bank, walk, withAnswer } from './helpers';

const emp = backgroundFor('emp');
const middle = walk(emp, () => 2);
const input = (steps: readonly Step[], more: Partial<ComputeInput> = {}): ComputeInput => ({ bank, background: emp, steps, ...more });
const sumOf = (b: PriceBreakdown): number => b.lines.reduce((sum, line) => sum + line.points, 0);

/** Every priced quantity: the lines add up to the change, and the change is after minus before. */
function expectSums(b: Breakdown, before: ComputeInput, after: ComputeInput): void {
  const from = compute(before);
  const to = compute(after);
  for (const a of AREA_IDS) {
    expect(b.sectors[a].before).toBe(from.sectors[a].price);
    expect(b.sectors[a].after).toBe(to.sectors[a].price);
    if (b.sectors[a].delta === null) {
      expect(b.sectors[a].lines).toEqual([]);
      continue;
    }
    expect(b.sectors[a].delta).toBe((to.sectors[a].price as number) - (from.sectors[a].price as number));
    expect(Math.abs(sumOf(b.sectors[a]) - b.sectors[a].delta), `sector ${a}`).toBeLessThanOrEqual(1e-9);
  }
  if (b.overall.delta !== null) {
    expect(b.overall.delta).toBe((to.overall as number) - (from.overall as number));
    expect(Math.abs(sumOf(b.overall) - b.overall.delta), 'overall').toBeLessThanOrEqual(1e-9);
  }
}

describe('one changed answer', () => {
  it('carries the whole change of every sector it loads on', () => {
    // B1 (rated health) loads on body, mind and wealth.
    const after = input(withAnswer(middle, 'B1', 4));
    const b = breakdown(input(middle), after);
    expect(b.changed).toBe(1);
    for (const a of ['B', 'M', 'W'] as const) {
      expect(b.sectors[a].lines).toHaveLength(1);
      expect(b.sectors[a].lines[0]).toMatchObject({
        kind: 'answer',
        id: 'B1',
        source: 'questionnaire',
        before: { key: 'base', k: 2, weight: 1, source: 'questionnaire' },
        after: { key: 'base', k: 4, weight: 1, source: 'questionnaire' },
      });
      expect(b.sectors[a].lines[0].points).toBeCloseTo(b.sectors[a].delta as number, 12);
      expect(b.sectors[a].delta as number).toBeGreaterThan(0);
      expect(b.sectors[a].method).toBe('scaled');
    }
    for (const a of ['C', 'N'] as const) expect(b.sectors[a]).toMatchObject({ delta: 0, lines: [], method: 'none' });
    expectSums(b, input(middle), after);
  });

  it('nothing changed: no lines', () => {
    const b = breakdown(input(middle), input(middle));
    expect(b.changed).toBe(0);
    for (const a of AREA_IDS) expect(b.sectors[a]).toMatchObject({ delta: 0, lines: [], method: 'none' });
    expect(b.overall).toMatchObject({ delta: 0, lines: [] });
  });
});

describe('many changed answers', () => {
  it('each line is one changed question, largest first, and the lines add up to the change', () => {
    const retake = middle.map((s, i): Step => (i % 3 === 0 ? { ...s, k: (i % 4) % bank.items[s.id].versions.find((v) => v.key === s.key)!.opts.length } : s));
    const changedIds = middle.filter((s, i) => retake[i].k !== s.k).map((s) => s.id);
    const b = breakdown(input(middle), input(retake));
    expect(b.changed).toBe(changedIds.length);
    expect(changedIds.length).toBeGreaterThan(5);
    for (const a of AREA_IDS) {
      const lines = b.sectors[a].lines;
      for (const line of lines) expect(changedIds).toContain(line.id);
      expect(lines.map((l) => Math.abs(l.points))).toEqual([...lines.map((l) => Math.abs(l.points))].sort((x, y) => y - x));
      // A question without a load on the sector has no line there.
      for (const line of lines) {
        const item = bank.items[line.id as string];
        const version = item.versions.find((v) => v.key === line.after?.key)!;
        expect((version.load ?? item.load)[a] ?? 0).toBeGreaterThan(0);
      }
    }
    expectSums(b, input(middle), input(retake));
  });

  it('holds for every role, with skips, other wordings and answer times in the mix', () => {
    let checked = 0;
    for (const role of bank.roles) {
      const background = backgroundFor(role.id);
      const first = walk(background, (q) => (q.index % 7 === 5 ? null : q.index % q.version.opts.length), { secs: 3 });
      // The second check changes the income answer too, so later questions are asked in other wordings.
      const second = walk(background, (q) => (q.index % 5 === 2 ? null : (q.index * 3 + 1) % q.version.opts.length), { secs: 0.4 });
      const before: ComputeInput = { bank, background, steps: first };
      const after: ComputeInput = { bank, background, steps: second };
      const b = breakdown(before, after);
      expect(b.changed).toBeGreaterThan(10);
      expectSums(b, before, after);
      checked++;
    }
    expect(checked).toBe(11);
  });

  it('a routing answer is one line that carries what it changed downstream', () => {
    // W1 to the top band: the tier becomes high and later wealth questions would be other wordings.
    const after = input(withAnswer(middle, 'W1', 6));
    const b = breakdown(input(middle), after);
    expect(b.changed).toBe(1);
    expect(b.sectors.W.lines.map((l) => l.id)).toEqual(['W1']);
    expectSums(b, input(middle), after);
  });
});

describe('overrides and extras', () => {
  const overrides: Override[] = [
    { itemId: 'B3', k: 3, source: 'daily_open' },
    { itemId: 'B2', k: 4, source: 'daily_open' },
    { itemId: 'W3', k: 4, source: 'payday' },
    { itemId: 'C_learn', k: 4, source: 'weekly_win' },
  ];
  const extras: Extra[] = [
    { id: 'daily_state', area: 'M', load: { M: 1 }, score: 0.9, source: 'daily_open' },
    { id: 'weekly_win', area: 'C', load: { C: 0.5 }, score: 1, source: 'weekly_win' },
    { id: 'people_reached', area: 'N', load: { N: 0.5 }, score: 0.25, source: 'people_nudge' },
  ];

  it('an overridden answer is a line with the source of the data, an extra item a line of its own', () => {
    const after = input(middle, { overrides, extras });
    const b = breakdown(input(middle), after);
    expect(b.changed).toBe(7);
    const body = b.sectors.B.lines;
    expect(body.map((l) => l.id).sort()).toEqual(['B2', 'B3']);
    expect(body.find((l) => l.id === 'B3')).toMatchObject({ kind: 'answer', source: 'daily_open', before: { k: 2, source: 'questionnaire' }, after: { k: 3, source: 'daily_open' } });
    expect(b.sectors.M.lines.find((l) => l.id === 'daily_state')).toMatchObject({ kind: 'extra', source: 'daily_open', before: null, after: null });
    expect(b.sectors.M.lines.find((l) => l.id === 'daily_state')!.points).toBeGreaterThan(0);
    expect(b.sectors.C.lines.map((l) => l.id).sort()).toEqual(['C_learn', 'weekly_win']);
    expect(b.sectors.N.lines).toHaveLength(1);
    expect(b.sectors.N.lines[0]).toMatchObject({ kind: 'extra', id: 'people_reached', source: 'people_nudge' });
    expect(b.sectors.N.lines[0].points).toBeLessThan(0);
    expect(b.sectors.W.lines.find((l) => l.id === 'W3')).toMatchObject({ source: 'payday' });
    expectSums(b, input(middle), after);
  });

  it('adds up between two days of data, in both directions, and when an extra goes away', () => {
    const monday = input(middle, { overrides: overrides.slice(0, 2), extras: [extras[0], extras[1]] });
    const friday = input(middle, {
      overrides: [{ itemId: 'B3', k: 1, source: 'daily_open' }, overrides[2]],
      extras: [{ ...extras[0], score: 0.35 }, extras[2]],
    });
    const forward = breakdown(monday, friday);
    expectSums(forward, monday, friday);
    const back = breakdown(friday, monday);
    expectSums(back, friday, monday);
    // B2 went back to the questionnaire answer: the line names the source that went away.
    expect(forward.sectors.B.lines.find((l) => l.id === 'B2')).toMatchObject({ before: { k: 4, source: 'daily_open' }, after: { k: 2, source: 'questionnaire' } });
    expect(forward.sectors.C.lines.find((l) => l.id === 'weekly_win')).toMatchObject({ kind: 'extra', source: 'weekly_win' });
    for (const a of AREA_IDS) expect(forward.sectors[a].delta).toBeCloseTo(-(back.sectors[a].delta as number), 12);
  });

  it('an answer that only changed its weight (a slow answer, then a hasty one) is a line too', () => {
    const slow = withAnswer(middle, 'M1', 4);
    const hasty = slow.map((s): Step => (s.id === 'M1' ? { ...s, secs: 0.01 } : s));
    const b = breakdown(input(slow), input(hasty));
    expect(b.sectors.M.lines).toHaveLength(1);
    expect(b.sectors.M.lines[0]).toMatchObject({ id: 'M1', before: { k: 4, weight: 1 }, after: { k: 4, weight: 0.5 } });
    expectSums(b, input(slow), input(hasty));
  });
});

describe('what is not an answer', () => {
  it('a change of algorithm version is a line of its own', () => {
    const variant = registerAlgo(createTestVariantAlgo());
    const uneven = walk(emp, (q) => (q.section === 'C' ? 0 : 4 % q.version.opts.length));
    const before = input(uneven);
    const after = input(withAnswer(uneven, 'M1', 0), { versions: { algo: variant.version } });
    const b = breakdown(before, after);
    expect(b.changed).toBe(1);
    expect(b.sectors.C.lines.map((l) => l.kind)).toEqual(['version']);
    expect(b.sectors.M.lines.map((l) => l.kind).sort()).toEqual(['answer', 'version']);
    expectSums(b, before, after);
  });

  it('when the two inputs differ in more than answers, the rest is one line "other" and the sum still holds', () => {
    const gig = backgroundFor('gig');
    const before = input(middle);
    const after: ComputeInput = { bank, background: gig, steps: walk(gig, () => 3) };
    const b = breakdown(before, after);
    for (const a of AREA_IDS) expect(b.sectors[a].method).toBe('remainder');
    expectSums(b, before, after);
    // The same check with two sectors left out for lack of consent.
    const without = input(middle, { excludedAreas: ['B', 'M'] });
    const partial = breakdown(before, without);
    expect(partial.sectors.B).toMatchObject({ before: compute(before).sectors.B.price, after: null, delta: null, lines: [] });
    expectSums(partial, before, without);
  });

  it('a sector without a price on either side has no change to explain', () => {
    const sparse = withAnswer(withAnswer(withAnswer(middle, 'B1', null), 'B2', null), 'B3', null);
    const b = breakdown(input(sparse), input(middle));
    expect(b.sectors.B).toMatchObject({ before: null, delta: null, lines: [], method: 'none' });
    expectSums(b, input(sparse), input(middle));
  });

  it('scaling is bounded by BREAKDOWN.maxScale', () => {
    expect(BREAKDOWN.maxScale).toBe(3);
  });
});

describe('between two days of the timeline', () => {
  const D = '2026-03-02';
  const day = (n: number): string => addDays(D, n);
  const daily: DailyEntry[] = [1, 2, 3, 4, 5, 6].map((n) => ({ day: day(n), sleep: 3, exercise: n % 5, state: (n * 2) % 5 }));
  const history = { checks: [{ day: D, background: emp, steps: middle }], daily };

  it('explains the change of the target prices, line by line', () => {
    const series = timeline({ ...history, until: day(6) });
    const b = explainDays(history, D, day(6))!;
    for (const a of AREA_IDS) {
      const delta = (series.points[6].sectors[a].target as number) - (series.points[0].sectors[a].target as number);
      expect(b.sectors[a].delta).toBeCloseTo(delta, 12);
      expect(Math.abs(sumOf(b.sectors[a]) - delta)).toBeLessThanOrEqual(1e-9);
    }
    expect(Math.abs(sumOf(b.overall) - ((series.points[6].overallTarget as number) - (series.points[0].overallTarget as number)))).toBeLessThanOrEqual(1e-9);
    expect(b.sectors.B.lines.every((l) => l.source === 'daily_open')).toBe(true);
    expect(b.sectors.M.lines.map((l) => l.id)).toContain('daily_state');
    expect(explainDays(history, day(-3), day(6))).toBeNull();
  });
});
