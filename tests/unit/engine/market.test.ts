// The data behind the market commentary and the sector tags, following renderResult of the
// reference page: leader, laggard, top gainer, top loser, limit up, limit down, the "level"
// case, and the rule that the mind sector is never called the laggard while the mind notice
// is shown.

import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, compute, marketOf } from '../../../src/engine';
import type { AreaId } from '../../../src/engine';
import { backgroundFor, bank, bestOption, chooseBest, chooseWorst, walk, worstOption } from './helpers';

type Prices = Record<AreaId, number | null>;
const prices = (C: number | null, W: number | null, N: number | null, B: number | null, M: number | null): Prices => ({ C, W, N, B, M });
const none = { C: null, W: null, N: null, B: null, M: null };

describe('leader, laggard and tags', () => {
  it('names the highest and the lowest sector', () => {
    const m = marketOf({ prices: prices(120, 95, 104, 88, 110), mindAlert: false });
    expect(m).toEqual({
      pricedCount: 5,
      flat: false,
      leader: 'C',
      laggard: 'B',
      tags: { ...none, C: 'leader', B: 'laggard' },
      change: null,
    });
  });

  it('calls sectors less than 3 points apart level: no leader, no laggard, no tags', () => {
    const m = marketOf({ prices: prices(101, 100, 102.9, 100.5, 100), mindAlert: false });
    expect(m.flat).toBe(true);
    expect(m.leader).toBeNull();
    expect(m.laggard).toBeNull();
    expect(m.tags).toEqual(none);
    // Exactly 3 points apart is not level.
    expect(marketOf({ prices: prices(103, 100, 101, 102, 100.5), mindAlert: false }).flat).toBe(false);
  });

  it('breaks ties in the order of the questionnaire', () => {
    const m = marketOf({ prices: prices(90, 110, 110, 90, 100), mindAlert: false });
    expect(m.leader).toBe('W');
    expect(m.laggard).toBe('B');
  });

  it('limit up and limit down win over leader and laggard', () => {
    const m = marketOf({ prices: prices(145, 145, 100, 55, 60), mindAlert: false });
    expect(m.tags).toEqual({ C: 'limit_up', W: 'limit_up', N: null, B: 'limit_down', M: null });
    expect(m.leader).toBe('C');
    expect(m.laggard).toBe('B');
    // Even when the sectors are level.
    const allUp = marketOf({ prices: prices(145, 145, 145, 145, 145), mindAlert: false });
    expect(allUp.flat).toBe(true);
    expect(Object.values(allUp.tags)).toEqual(Array(5).fill('limit_up'));
  });

  it('while the mind notice is shown, mind is never the laggard and never tagged so', () => {
    const lowMind = prices(120, 95, 104, 98, 80);
    const without = marketOf({ prices: lowMind, mindAlert: false });
    expect(without.laggard).toBe('M');
    expect(without.tags.M).toBe('laggard');
    const withNotice = marketOf({ prices: lowMind, mindAlert: true });
    expect(withNotice.laggard).toBeNull();
    expect(withNotice.tags).toEqual({ ...none, C: 'leader' });
    expect(withNotice.leader).toBe('C');
    // No other sector is named in its place.
    expect(Object.values(withNotice.tags)).not.toContain('laggard');
    // When another sector is lowest, the notice changes nothing.
    const lowBody = prices(120, 95, 104, 70, 80);
    expect(marketOf({ prices: lowBody, mindAlert: true }).laggard).toBe('B');
  });

  it('handles sectors without a price', () => {
    const three = marketOf({ prices: prices(120, 95, 104, null, null), mindAlert: false });
    expect(three).toMatchObject({ pricedCount: 3, flat: false, leader: 'C', laggard: 'W' });
    expect(three.tags.B).toBeNull();
    const one = marketOf({ prices: prices(120, null, null, null, null), mindAlert: false });
    expect(one).toMatchObject({ pricedCount: 1, flat: true, leader: null, laggard: null });
    const zero = marketOf({ prices: none, mindAlert: false });
    expect(zero).toMatchObject({ pricedCount: 0, flat: false, leader: null, laggard: null, change: null });
  });
});

describe('top gainer and top loser', () => {
  const now = prices(120, 95, 104, 88, 110);

  it('needs a previous record', () => {
    expect(marketOf({ prices: now, mindAlert: false }).change).toBeNull();
    expect(marketOf({ prices: now, mindAlert: false, previous: null }).change).toBeNull();
  });

  it('mixed: names the largest rise and the largest fall', () => {
    const change = marketOf({ prices: now, mindAlert: false, previous: prices(110, 100, 104, 90, 105) }).change;
    expect(change).toEqual({
      kind: 'mixed',
      topGainer: { area: 'C', delta: 10 },
      topLoser: { area: 'W', delta: -5 },
      deltas: { B: -2, W: -5, N: 0, C: 10, M: 5 },
    });
  });

  it('all up: every sector rose, names the largest rise only', () => {
    const change = marketOf({ prices: now, mindAlert: false, previous: prices(110, 94, 100, 80, 109) }).change;
    expect(change).toMatchObject({ kind: 'all_up', topGainer: { area: 'C', delta: 10 }, topLoser: null });
  });

  it('all down: every sector fell, names the largest fall only', () => {
    const change = marketOf({ prices: now, mindAlert: false, previous: prices(121, 99, 105, 96, 111) }).change;
    expect(change).toMatchObject({ kind: 'all_down', topGainer: null, topLoser: { area: 'B', delta: -8 } });
  });

  // The daily open moves only body and mind, so the other three sectors change by exactly 0
  // every day. The reference page reads a change of 0 as both "up" and "down" and would print
  // "every sector is down" here. Deliberate departure; see changeOf in market.ts.
  const day = { C: 104, W: 98, N: 101, B: 107, M: 95 };

  it('one sector down and four unchanged is some_down, not all_down', () => {
    const change = marketOf({ prices: day, mindAlert: false, previous: { ...day, B: 108 } }).change;
    expect(change).toEqual({
      kind: 'some_down',
      topGainer: null,
      topLoser: { area: 'B', delta: -1 },
      deltas: { B: -1, W: 0, N: 0, C: 0, M: 0 },
    });
  });

  it('one sector up and four unchanged is some_up, not all_up', () => {
    const change = marketOf({ prices: day, mindAlert: false, previous: { ...day, M: 94.5 } }).change;
    expect(change).toMatchObject({ kind: 'some_up', topGainer: { area: 'M', delta: 0.5 }, topLoser: null });
  });

  it('no change at all is unchanged and names no mover', () => {
    const change = marketOf({ prices: day, mindAlert: false, previous: { ...day } }).change;
    expect(change).toEqual({ kind: 'unchanged', topGainer: null, topLoser: null, deltas: { B: 0, W: 0, N: 0, C: 0, M: 0 } });
  });

  it('body up, mind down and three unchanged is mixed', () => {
    const change = marketOf({ prices: day, mindAlert: false, previous: { ...day, B: 105, M: 97 } }).change;
    expect(change).toMatchObject({ kind: 'mixed', topGainer: { area: 'B', delta: 2 }, topLoser: { area: 'M', delta: -2 } });
  });

  it('a change that reads 0.00 at two decimals counts as unchanged (band of 0.005 points)', () => {
    const band = ALGO_PARAMS[1].market.unchangedBand;
    expect(band).toBe(0.005);
    const kindFor = (bodyBefore: number, mindBefore: number): string | undefined =>
      marketOf({ prices: day, mindAlert: false, previous: { ...day, B: bodyBefore, M: mindBefore } }).change?.kind;
    // Body rose 0.004 and mind fell 0.004: neither is a move.
    expect(kindFor(106.996, 95.004)).toBe('unchanged');
    // Body rose 1; mind fell 0.004, which is not a fall. The reference rule would call this mixed.
    expect(kindFor(106, 95.004)).toBe('some_up');
    // Mind fell 0.02: that is a fall.
    expect(kindFor(106, 95.02)).toBe('mixed');
  });

  it('where every compared sector moved, the kind is the one the reference page prints', () => {
    // renderResult: l.d >= 0 ? talkUp : g.d <= 0 ? talkDown : talk2, on deltas sorted high to low.
    const pageKind = (deltas: number[]): string => {
      const sorted = [...deltas].sort((x, y) => y - x);
      return sorted[sorted.length - 1] >= 0 ? 'all_up' : sorted[0] <= 0 ? 'all_down' : 'mixed';
    };
    const moves = [-7.5, -0.02, 0.02, 3, 12];
    let checked = 0;
    for (const c of moves) for (const w of moves) for (const n of moves) for (const b of moves) for (const m of moves) {
      const change = marketOf({ prices: now, mindAlert: false, previous: prices(120 - c, 95 - w, 104 - n, 88 - b, 110 - m) }).change;
      expect(change?.kind).toBe(pageKind([c, w, n, b, m]));
      checked++;
    }
    expect(checked).toBe(3125);
  });

  it('equal moves resolve in the order of the result page (body, wealth, network, capability, mind)', () => {
    const change = marketOf({ prices: now, mindAlert: false, previous: prices(115, 100, 99, 93, 115) }).change;
    // Capability and network both rose 5; wealth, body and mind all fell 5.
    expect(change?.topGainer).toEqual({ area: 'N', delta: 5 });
    expect(change?.topLoser).toEqual({ area: 'M', delta: -5 });
  });

  it('compares only sectors priced in both records, and needs two of them', () => {
    const fewer = marketOf({ prices: now, mindAlert: false, previous: prices(110, null, null, 90, null) }).change;
    expect(fewer?.deltas).toEqual({ B: -2, C: 10 });
    expect(marketOf({ prices: now, mindAlert: false, previous: prices(110, null, null, null, null) }).change).toBeNull();
    expect(marketOf({ prices: prices(120, null, null, null, 100), mindAlert: false, previous: prices(null, 99, 99, 99, 99) }).change).toBeNull();
    expect(ALGO_PARAMS[1].market.minMovers).toBe(2);
    // all_up needs every COMPARED sector to have risen, not all five.
    expect(fewer?.kind).toBe('mixed');
    expect(marketOf({ prices: now, mindAlert: false, previous: prices(110, null, null, 80, null) }).change?.kind).toBe('all_up');
  });
});

describe('compute fills the market view', () => {
  const emp = backgroundFor('emp');

  it('all best: level, no type', () => {
    const result = compute({ bank, background: emp, steps: walk(emp, chooseBest) });
    expect(result.market).toMatchObject({ flat: true, leader: null, laggard: null, pricedCount: 5 });
    expect(result.type).toBeNull();
  });

  it('type is the two highest sectors', () => {
    const lowMind = walk(emp, (q) => (q.section === 'M' ? worstOption(q.version) : q.section === 'B' ? 2 : bestOption(q.version)));
    const result = compute({ bank, background: emp, steps: lowMind });
    expect(result.type).toEqual([result.rank[0], result.rank[1]]);
    expect(result.market.leader).toBe(result.rank[0]);
    expect(result.rank[result.rank.length - 1]).toBe('M');
    // The worst answers on both mood questions show the mind notice, so mind is not the laggard.
    expect(result.mindAlert).toBe(true);
    expect(result.market.laggard).toBeNull();
    expect(result.market.tags.M).toBeNull();
    expect(Object.values(result.market.tags)).not.toContain('laggard');
  });

  it('a mind notice from daily data (input.mindNotice) keeps mind from being called the laggard', () => {
    // Mind answers at the second-lowest option: mind is lowest, and the questionnaire rule does not fire.
    const steps = walk(emp, (q) => (q.section === 'M' ? 1 : bestOption(q.version)));
    // A week of "very bad" on the daily state question arrives as an extra with score 0.
    const extras = [{ id: 'daily_state', area: 'M' as const, load: { M: 1 }, score: 0, source: 'daily_open' as const }];
    const without = compute({ bank, background: emp, steps, extras });
    expect(without.mindAlert).toBe(false);
    expect(without.mindNotice).toBe(false);
    expect(without.market.laggard).toBe('M');
    expect(without.market.tags.M).toBe('laggard');

    const withNotice = compute({ bank, background: emp, steps, extras, mindNotice: true });
    // mindAlert stays the questionnaire rule; mindNotice is what the result page shows.
    expect(withNotice.mindAlert).toBe(false);
    expect(withNotice.mindNotice).toBe(true);
    expect(withNotice.market.laggard).toBeNull();
    expect(withNotice.market.tags.M).toBeNull();
    expect(Object.values(withNotice.market.tags)).not.toContain('laggard');
    expect(withNotice.market.leader).toBe(without.market.leader);
    // Nothing else moves: the notice is about wording, not about the price.
    expect(withNotice.sectors).toEqual(without.sectors);
    expect(withNotice.overall).toBe(without.overall);
    expect(withNotice.flags).toEqual(without.flags);
    // The questionnaire rule sets the combined notice by itself, and mindNotice: false does not unset it.
    const alert = compute({ bank, background: emp, steps: walk(emp, (q) => (q.section === 'M' ? 0 : bestOption(q.version))), mindNotice: false });
    expect(alert.mindAlert).toBe(true);
    expect(alert.mindNotice).toBe(true);
    expect(alert.market.laggard).toBeNull();
  });

  it('mind is the laggard when it is lowest and the notice is not shown', () => {
    const steps = walk(emp, (q) => (q.id === 'M3' ? 1 : q.section === 'M' ? worstOption(q.version) : bestOption(q.version)));
    const result = compute({ bank, background: emp, steps });
    expect(result.mindAlert).toBe(false);
    expect(result.market.laggard).toBe('M');
    expect(result.market.tags.M).toBe('laggard');
  });

  it('movers come from the previous record passed in', () => {
    const before = compute({ bank, background: emp, steps: walk(emp, chooseWorst) });
    const previous = Object.fromEntries(Object.entries(before.sectors).map(([a, s]) => [a, s.price]));
    const after = compute({ bank, background: emp, steps: walk(emp, chooseBest), previous });
    expect(after.market.change?.kind).toBe('all_up');
    expect(after.market.change?.topLoser).toBeNull();
    const delta = after.market.change?.topGainer?.delta as number;
    expect(delta).toBeGreaterThan(60);
    const again = compute({ bank, background: emp, steps: walk(emp, chooseWorst), previous: Object.fromEntries(Object.entries(after.sectors).map(([a, s]) => [a, s.price])) });
    expect(again.market.change?.kind).toBe('all_down');
    expect(compute({ bank, background: emp, steps: walk(emp, chooseBest) }).market.change).toBeNull();
  });

  it('limit tags follow the reference page, also for mind while the notice is shown', () => {
    // Bank 2.1 on the provisional norm never reaches a limit (best 137.50, worst about 63).
    const result = compute({ bank, background: emp, steps: walk(emp, chooseBest) });
    expect(Object.values(result.market.tags)).toEqual(Array(5).fill(null));
    // The reference page withholds only "laggard" for mind. A limit is a fact about the price.
    expect(marketOf({ prices: { C: 145, W: 100, N: 100, B: 100, M: 55 }, mindAlert: true }).tags).toEqual({
      C: 'limit_up',
      W: null,
      N: null,
      B: null,
      M: 'limit_down',
    });
  });
});
