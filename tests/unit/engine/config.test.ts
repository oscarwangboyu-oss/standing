// config.ts as the one source of truth: the values compute reads are the values in the file,
// the tables cannot be changed at run time, and the bands follow the option texts of the bank.

import { describe, expect, it } from 'vitest';
import {
  ALGOS,
  ALGO_PARAMS,
  BANKS,
  BANK_BANDS,
  CURRENT,
  DASHBOARD_RED_LINES,
  EngineError,
  GO_CRITERIA,
  NORMS,
  RETEST_WINDOW_DAYS,
  RETURN_RATE_DAYS,
  bandOptionFor,
  compute,
  createAlgoV1,
  getAlgo,
  getNorm,
  registerAlgo,
} from '../../../src/engine';
import type { ItemVersion } from '../../../src/engine';
import { RULES } from '../../../src/engine/algo/v1/rules';
import { backgroundFor, bank, bestOption, chooseBest, walk } from './helpers';

const emp = backgroundFor('emp');
const versionOf = (id: string, key: string): ItemVersion => bank.items[id].versions.find((v) => v.key === key)!;

/** Runs a copy of algorithm 1 with changed parameters, without registering it. */
function computeWith(change: (params: (typeof ALGO_PARAMS)[number]) => void, steps = walk(emp, chooseBest)) {
  const params = structuredClone(ALGO_PARAMS[1]);
  change(params);
  return createAlgoV1(99, params).compute({
    bank,
    background: emp,
    steps,
    versions: { algo: 99, bank: bank.bank_version, norm: CURRENT.norm },
    norm: getNorm(),
  });
}

describe('the interest correction reads its four values from config.ts', () => {
  // Everything best except the interest question, answered wrong.
  const steps = walk(emp, (q) => (q.id === 'C_int' ? 1 : bestOption(q.version)));
  const base = compute({ bank, background: emp, steps });

  it('is on in the baseline: capability sits 10% of the way back to the median', () => {
    expect(ALGO_PARAMS[1].interest).toEqual({ itemId: 'C_int', area: 'C', correctScore: 1, shrink: 0.1 });
    expect(base.interestWrong).toBe(true);
    expect(base.sectors.C.price as number).toBeLessThan(137.5);
    expect(computeWith(() => undefined, steps).sectors).toEqual(base.sectors);
  });

  it('itemId: pointed at a question answered with its best option, no correction is made', () => {
    const moved = computeWith((p) => (p.interest.itemId = 'C_pur'), steps);
    expect(moved.interestWrong).toBe(false);
    expect(moved.sectors.C.price as number).toBeGreaterThan(base.sectors.C.price as number);
  });

  it('area: the correction moves the sector named there', () => {
    const moved = computeWith((p) => (p.interest.area = 'W'), steps);
    expect(moved.interestWrong).toBe(true);
    expect(moved.sectors.C.price as number).toBeGreaterThan(base.sectors.C.price as number);
    expect(moved.sectors.W.price as number).toBeLessThan(base.sectors.W.price as number);
    // Wealth moves 10% of the way to the median, capability gets its 10% back.
    const wealth = base.sectors.W.raw as number;
    expect(moved.sectors.W.raw).toBeCloseTo(wealth + 0.1 * (0.5 - wealth), 12);
    const capability = moved.sectors.C.raw as number;
    expect(base.sectors.C.raw).toBeCloseTo(capability + 0.1 * (0.5 - capability), 12);
  });

  it('correctScore: the score that counts as correct', () => {
    // The wrong option scores 0. Calling 0 the correct score switches the correction off.
    expect(computeWith((p) => (p.interest.correctScore = 0), steps).interestWrong).toBe(false);
    // And the option that scores 1 then counts as wrong.
    expect(computeWith((p) => (p.interest.correctScore = 0)).interestWrong).toBe(true);
  });

  it('shrink: the share of the distance to the median', () => {
    const none = computeWith((p) => (p.interest.shrink = 0), steps);
    expect(none.interestWrong).toBe(true);
    expect(none.sectors.C.price as number).toBeGreaterThan(base.sectors.C.price as number);
  });
});

describe('other values moved out of the code', () => {
  it('market.minMovers and market.unchangedBand are read', () => {
    const prices = { C: 104, W: 98, N: 101, B: 107, M: 95 };
    const previous = { ...prices, B: 106.99 };
    const algo = (change: (params: (typeof ALGO_PARAMS)[number]) => void) => {
      const params = structuredClone(ALGO_PARAMS[1]);
      change(params);
      return createAlgoV1(99, params);
    };
    expect(getAlgo().marketOf(prices, bank.order, false, previous).change?.kind).toBe('some_up');
    expect(algo((p) => (p.market.unchangedBand = 0.05)).marketOf(prices, bank.order, false, previous).change?.kind).toBe('unchanged');
    expect(algo((p) => (p.market.minMovers = 6)).marketOf(prices, bank.order, false, previous).change).toBeNull();
  });

  it('the questions the rules read by name exist in every registered bank', () => {
    for (const b of Object.values(BANKS)) {
      const ids = [
        RULES.ladderItem,
        ...RULES.mindNotice.map((q) => q.id),
        ...RULES.contrasts.moneyFacts,
        ...RULES.contrasts.moneyWorry,
        ...RULES.contrasts.peopleFacts,
        ...RULES.contrasts.peopleLonely,
        ...RULES.contrasts.healthHabits,
        ...RULES.contrasts.healthRated,
        ALGO_PARAMS[1].interest.itemId,
      ];
      for (const id of ids) expect(b.items[id], id).toBeDefined();
    }
  });
});

describe('the shared tables are frozen', () => {
  it('parameters, norms, bands, dashboard values and rules, all the way down', () => {
    const deeplyFrozen = (value: unknown): boolean =>
      typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));
    expect(deeplyFrozen(bank)).toBe(true);
    expect(deeplyFrozen(ALGO_PARAMS)).toBe(true);
    expect(deeplyFrozen(NORMS)).toBe(true);
    expect(deeplyFrozen(BANK_BANDS)).toBe(true);
    expect(deeplyFrozen(DASHBOARD_RED_LINES)).toBe(true);
    expect(deeplyFrozen(GO_CRITERIA)).toBe(true);
    expect(deeplyFrozen(RETEST_WINDOW_DAYS)).toBe(true);
    expect(deeplyFrozen(RETURN_RATE_DAYS)).toBe(true);
    expect(deeplyFrozen(RULES)).toBe(true);
    expect(Object.isFrozen(BANKS)).toBe(true);
    expect(Object.isFrozen(CURRENT)).toBe(true);
    expect(Object.isFrozen(ALGOS[1])).toBe(true);
    // Spot checks of the leaves a stray write would hit.
    expect(Object.isFrozen(ALGO_PARAMS[1].price)).toBe(true);
    expect(Object.isFrozen(NORMS['provisional-1'].sectors.C)).toBe(true);
    expect(Object.isFrozen(BANK_BANDS['2.1'].B3.lowerEdges)).toBe(true);
  });

  it('a write throws, and results of version 1 stay what they were', () => {
    const before = compute({ bank, background: emp, steps: walk(emp, chooseBest) });
    expect(() => {
      NORMS['provisional-1'].sectors.C.median = 0.9;
    }).toThrow(TypeError);
    expect(() => {
      ALGO_PARAMS[1].price.pointsPerSd = 10;
    }).toThrow(TypeError);
    expect(() => {
      BANK_BANDS['2.1'].B3.lowerEdges[4] = 8;
    }).toThrow(TypeError);
    expect(() => {
      (ALGOS as Record<number, unknown>)[1] = createAlgoV1(1, ALGO_PARAMS[1]);
    }).toThrow(TypeError);
    expect(() => {
      delete (ALGOS as Record<number, unknown>)[1];
    }).toThrow(TypeError);
    expect(() => {
      (BANKS as Record<string, unknown>)['9.9'] = bank;
    }).toThrow(TypeError);
    expect(NORMS['provisional-1'].sectors.C.median).toBe(0.5);
    expect(ALGO_PARAMS[1].price.pointsPerSd).toBe(15);
    expect(compute({ bank, background: emp, steps: walk(emp, chooseBest) })).toEqual(before);
  });

  it('an algorithm keeps its own copy of the parameters it was built with', () => {
    const params = structuredClone(ALGO_PARAMS[1]);
    const algo = createAlgoV1(98, params);
    const input = { bank, background: emp, steps: walk(emp, chooseBest), versions: { algo: 98, bank: '2.1', norm: CURRENT.norm }, norm: getNorm() };
    const before = algo.compute(input);
    // The caller's object stays writable, and writing to it afterwards changes nothing.
    params.price.pointsPerSd = 10;
    params.timing.multiplierFloor = 0.9;
    expect(algo.compute(input)).toEqual(before);
    expect(algo.timing.multiplierFloor).toBe(0.5);
    expect(before.sectors.W.price).toBeCloseTo(137.5, 9);
  });
});

describe('registerAlgo', () => {
  it('adds an altered algorithm beside version 1, which compute can then be asked for', () => {
    const steps = walk(emp, (q) => (q.section === 'C' ? 0 : bestOption(q.version)));
    const before = compute({ bank, background: emp, steps });
    const params = structuredClone(ALGO_PARAMS[1]);
    params.sector.ownShare = 0.5;
    params.sector.otherShare = 0.5;
    const added = registerAlgo(createAlgoV1(7001, params));
    expect(getAlgo(7001)).toBe(added);
    const changed = compute({ bank, background: emp, steps, versions: { algo: 7001 } });
    expect(changed.versions).toEqual({ algo: 7001, bank: '2.1', norm: 'provisional-1' });
    expect(changed.sectors.C.price).not.toBe(before.sectors.C.price);
    // Version 1 is untouched and still the default.
    expect(compute({ bank, background: emp, steps })).toEqual(before);
    expect(CURRENT.algo).toBe(1);
  });

  it('refuses a version number that is taken, or that is not a whole number from 1', () => {
    expect(() => registerAlgo(createAlgoV1(1, ALGO_PARAMS[1]))).toThrow(EngineError);
    expect(() => registerAlgo(createAlgoV1(7001, ALGO_PARAMS[1]))).toThrow(EngineError);
    expect(() => registerAlgo(createAlgoV1(0, ALGO_PARAMS[1]))).toThrow(EngineError);
    expect(() => registerAlgo(createAlgoV1(1.5, ALGO_PARAMS[1]))).toThrow(EngineError);
    expect(getAlgo(1).version).toBe(1);
  });
});

describe('BANK_BANDS against the option texts of bank 2.1', () => {
  const option = (band: string, value: number): number => bandOptionFor('2.1', band, value);
  const texts = (v: ItemVersion): string[] => v.opts.map((o) => o.en);

  it('the option texts are the ones the bands were read off', () => {
    expect(texts(bank.items.B3.versions[0])).toEqual(['Under 5', '5 to 6', '6 to 7', '7 to 9', 'More than 9']);
    expect(texts(bank.items.B2.versions[0])).toEqual(['Under 30', '30 to 89', '90 to 149', '150 to 299', '300 or more']);
    for (const key of ['base', 'sup', 'seek']) {
      expect(texts(versionOf('W3', key))).toEqual(['Less than 2 weeks', '2 weeks to 1 month', '1 to 3 months', '3 to 6 months', 'More than 6 months']);
    }
    expect(texts(versionOf('W5', 'save'))).toEqual(['Under 5%', '5% to 9%', '10% to 19%', '20% to 34%', '35% or more']);
    for (const key of ['debt', 'hh']) {
      expect(texts(versionOf('W5', key))).toEqual(['36% or more', '20% to 35%', '10% to 19%', 'Under 10%', 'No debt payments']);
    }
  });

  // Every edge value, just below it and just above it, pinned to the option whose text holds it.
  it.each([
    // B3, hours of sleep.
    ['B3', 0, 'Under 5'],
    ['B3', 4.99, 'Under 5'],
    ['B3', 5, '5 to 6'],
    ['B3', 5.99, '5 to 6'],
    ['B3', 6, '6 to 7'],
    ['B3', 6.99, '6 to 7'],
    ['B3', 7, '7 to 9'],
    ['B3', 8.99, '7 to 9'],
    // "More than 9" starts above 9.
    ['B3', 9, '7 to 9'],
    ['B3', 9.01, 'More than 9'],
    ['B3', 12, 'More than 9'],
    // B2, minutes of activity a week.
    ['B2', 0, 'Under 30'],
    ['B2', 29.9, 'Under 30'],
    ['B2', 30, '30 to 89'],
    ['B2', 89.9, '30 to 89'],
    ['B2', 90, '90 to 149'],
    ['B2', 149.9, '90 to 149'],
    ['B2', 150, '150 to 299'],
    ['B2', 299.9, '150 to 299'],
    ['B2', 300, '300 or more'],
    ['B2', 525, '300 or more'],
    // W3, months of savings. Two weeks is half a month.
    ['W3', 0, 'Less than 2 weeks'],
    ['W3', 0.49, 'Less than 2 weeks'],
    ['W3', 0.5, '2 weeks to 1 month'],
    ['W3', 0.99, '2 weeks to 1 month'],
    ['W3', 1, '1 to 3 months'],
    ['W3', 2.99, '1 to 3 months'],
    ['W3', 3, '3 to 6 months'],
    ['W3', 5.99, '3 to 6 months'],
    // "More than 6 months" starts above 6.
    ['W3', 6, '3 to 6 months'],
    ['W3', 6.01, 'More than 6 months'],
    ['W3', 40, 'More than 6 months'],
  ] as Array<[string, number, string]>)('%s: %f is "%s"', (band, value, text) => {
    const version = band === 'W3' ? versionOf('W3', 'base') : bank.items[band].versions[0];
    expect(version.opts[option(band, value)].en).toBe(text);
  });

  it.each([
    ['W5:save', 'save', 0, 'Under 5%'],
    ['W5:save', 'save', 0.049, 'Under 5%'],
    ['W5:save', 'save', 0.05, '5% to 9%'],
    ['W5:save', 'save', 0.099, '5% to 9%'],
    ['W5:save', 'save', 0.1, '10% to 19%'],
    ['W5:save', 'save', 0.199, '10% to 19%'],
    ['W5:save', 'save', 0.2, '20% to 34%'],
    ['W5:save', 'save', 0.349, '20% to 34%'],
    ['W5:save', 'save', 0.35, '35% or more'],
    ['W5:save', 'save', 1, '35% or more'],
    // Debt: exactly nothing is "No debt payments"; anything above nothing is a payment.
    ['W5:debt', 'debt', 0, 'No debt payments'],
    ['W5:debt', 'debt', 0.0001, 'Under 10%'],
    ['W5:debt', 'debt', 0.099, 'Under 10%'],
    ['W5:debt', 'debt', 0.1, '10% to 19%'],
    ['W5:debt', 'debt', 0.199, '10% to 19%'],
    ['W5:debt', 'debt', 0.2, '20% to 35%'],
    ['W5:debt', 'debt', 0.359, '20% to 35%'],
    ['W5:debt', 'debt', 0.36, '36% or more'],
    ['W5:debt', 'debt', 2, '36% or more'],
    ['W5:debt', 'hh', 0, 'No debt payments'],
    ['W5:debt', 'hh', 0.25, '20% to 35%'],
  ] as Array<[string, string, number, string]>)('%s (version %s): %f is "%s"', (band, key, value, text) => {
    expect(versionOf('W5', key).opts[option(band, value)].en).toBe(text);
  });

  it('nine hours from the daily midpoints is "7 to 9", and $12,000 over $2,000 a month is "3 to 6 months"', () => {
    // Two days of "7 to 9" (8 h) and four days of "More than 9" (9.5 h) in the 7-day window.
    const mid = ALGO_PARAMS[1].dailyOpen.sleep.midpointHours;
    const week = [mid[3], mid[3], mid[4], mid[4], mid[4], mid[4]];
    const mean = week.reduce((a, b) => a + b, 0) / week.length;
    expect(mean).toBe(9);
    expect(option('B3', mean)).toBe(3);
    expect(bank.items.B3.versions[0].s[option('B3', mean)]).toBe(1);
    expect(option('W3', 12000 / 2000)).toBe(3);
  });

  it('each band table has one band per option, ascending edges, and a flag per band where flags are given', () => {
    for (const [name, band] of Object.entries(BANK_BANDS['2.1'])) {
      const n = band.optionForBand.length;
      expect(band.lowerEdges, name).toHaveLength(n);
      expect([...band.optionForBand].sort(), name).toEqual([...Array(n).keys()]);
      expect([...band.lowerEdges].sort((x, y) => x - y), name).toEqual(band.lowerEdges);
      expect(band.lowerEdges[0], name).toBe(0);
      if (band.lowerExclusive) expect(band.lowerExclusive, name).toHaveLength(n);
    }
    // The questions named in the parameters are the ones that have bands.
    const p = ALGO_PARAMS[1];
    expect(Object.keys(BANK_BANDS['2.1']).sort()).toEqual(
      [p.dailyOpen.sleep.itemId, p.dailyOpen.exercise.itemId, p.payday.runwayItemId, `${p.payday.shareItemId}:save`, `${p.payday.shareItemId}:debt`].sort(),
    );
  });

  it('refuses what it cannot place', () => {
    expect(() => bandOptionFor('9.9', 'B3', 8)).toThrow(EngineError);
    expect(() => bandOptionFor('2.1', 'B9', 8)).toThrow(EngineError);
    expect(() => bandOptionFor('2.1', 'toString', 8)).toThrow(EngineError);
    expect(() => bandOptionFor('2.1', 'B3', Number.NaN)).toThrow(EngineError);
    expect(() => bandOptionFor('2.1', 'B3', Number.POSITIVE_INFINITY)).toThrow(EngineError);
    expect(() => bandOptionFor('2.1', 'B3', -1)).toThrow(EngineError);
  });
});
