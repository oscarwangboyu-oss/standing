// The bank the app ships, its typing, and the values in config.ts that must agree with it.

import { describe, expect, it } from 'vitest';
import reference from '../../../reference/bank_v2.1.json';
import shipped from '../../../src/engine/bank/v2_1.json';
import {
  ALGO_PARAMS,
  ALGOS,
  BANKS,
  BANK_BANDS,
  CURRENT,
  DASHBOARD_RED_LINES,
  EngineError,
  GO_CRITERIA,
  NORMS,
  compute,
  getAlgo,
  getBank,
  getNorm,
  parseBank,
} from '../../../src/engine';
import type { AreaId, NormSet } from '../../../src/engine';
import { createAlgoV1 } from '../../../src/engine/algo/v1';
import { AREAS, backgroundFor, bank, chooseBest, chooseWorst, walk } from './helpers';

/** A deep copy of the reference bank that a test may break on purpose. */
function copy(): any {
  return JSON.parse(JSON.stringify(reference));
}

describe('bank 2.1', () => {
  it('is deep-equal to reference/bank_v2.1.json', () => {
    expect(shipped).toEqual(reference);
    expect(bank).toEqual(reference);
    expect(JSON.stringify(bank)).toBe(JSON.stringify(reference));
  });

  it('has 42 questions, 93 versions and 11 roles', () => {
    expect(Object.keys(bank.items)).toHaveLength(42);
    expect(Object.values(bank.items).reduce((n, item) => n + item.versions.length, 0)).toBe(93);
    expect(bank.roles).toHaveLength(11);
    expect(bank.bank_version).toBe('2.1');
  });

  it('is frozen, so shared state cannot be changed by accident', () => {
    expect(Object.isFrozen(bank)).toBe(true);
    expect(Object.isFrozen(bank.items.W1.versions[0].s)).toBe(true);
    expect(() => {
      (bank.items.W1.versions[0].s as number[])[0] = 1;
    }).toThrow(TypeError);
  });

  it('parseBank accepts the reference and returns the same object', () => {
    const raw = copy();
    expect(parseBank(raw)).toBe(raw);
  });

  it.each([
    ['a score list shorter than the options', (b: any) => b.items.B1.versions[0].s.pop()],
    ['a score above 1', (b: any) => (b.items.B1.versions[0].s[0] = 1.5)],
    ['a version with no scored option', (b: any) => (b.items.C_int.versions[0].s = [null, null, null, null])],
    ['a pin outside the options', (b: any) => (b.items.B4.versions[0].pin = [9])],
    ['a question that does not load on its own sector', (b: any) => (b.items.B4.load = { M: 1 })],
    ['an unknown sector', (b: any) => (b.items.B4.area = 'X')],
    ['a questionnaire that names an unknown question', (b: any) => b.comp.ug4.push('Z9')],
    ['a question twice in one questionnaire', (b: any) => b.comp.ug4.push('B1')],
    ['a malformed slot', (b: any) => (b.comp.emp[1] = ['alt', 'mgr', 1, 'C_team'])],
    ['a tier list of the wrong length', (b: any) => b.items.W1.versions[0].tier.pop()],
    ['an unknown tier', (b: any) => (b.items.W1.versions[0].tier[0] = 'top')],
    ['an unknown role', (b: any) => (b.roles[0].id = 'nobody')],
    ['a missing questionnaire', (b: any) => delete b.comp.oth],
    ['a missing section title', (b: any) => delete b.section.G],
    ['an empty stem', (b: any) => (b.items.B1.versions[0].q.en = '')],
    ['a condition on an unknown attribute', (b: any) => (b.items.W2.versions[0].when = { colour: ['red'] })],
    ['missing timing', (b: any) => delete b.timing.floor],
  ])('parseBank rejects %s', (_name, breakIt) => {
    const raw = copy();
    breakIt(raw);
    expect(() => parseBank(raw)).toThrow(EngineError);
  });
});

describe('config.ts', () => {
  const timing = ALGO_PARAMS[1].timing;

  it('timing agrees with the timing block the bank carries', () => {
    expect(timing.scanPerMinute.zh / 60).toBe(bank.timing.zh);
    expect(timing.scanPerMinute.en / 60).toBe(bank.timing.en);
    expect(timing.thresholdMinSeconds).toBe(bank.timing.tmin);
    expect(timing.thresholdMaxSeconds).toBe(bank.timing.tmax);
    expect(timing.multiplierFloor).toBe(bank.timing.floor);
  });

  it('holds the appendix values of the brief', () => {
    const p = ALGO_PARAMS[1];
    expect(timing.scanPerMinute).toEqual({ zh: 2200, en: 1400 });
    expect([timing.thresholdMinSeconds, timing.thresholdMaxSeconds, timing.multiplierFloor]).toEqual([0.6, 2.0, 0.5]);
    expect(p.sector.minOwnScoredShare).toBe(0.6);
    expect(p.overall.minPricedSectors).toBe(3);
    expect(p.skipDefaults).toEqual({ tier: 'mid', tierWhenMoneyIsSup: 'sup', mgr: 0 });
    expect(p.dailyMoveLimitPoints).toBe(2);
    expect(p.dailyOpen.windowDays).toBe(7);
    expect(p.dailyOpen.minDays).toBe(4);
    expect(p.dailyOpen.sleep.midpointHours).toEqual([4.5, 5.5, 6.5, 8, 9.5]);
    expect(p.dailyOpen.exercise.midpointMinutes).toEqual([0, 10, 30, 50, 75]);
    expect(p.dailyOpen.state.scores).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(p.dailyOpen.state.load).toBe(1);
    expect(p.dailyOpen.haltAfterDays).toBe(14);
    expect(p.dailyOpen.retestAfterDays).toBe(90);
    expect(p.dailyOpen.streak).toEqual({ backfillDays: 1, resetAfterMissedDays: 2 });
    expect(p.dailyOpen.mindNotice).toEqual({ windowDays: 7, veryBadDays: 5 });
    expect(p.payday.averagePeriods).toBe(3);
    expect(p.payday.haltAfterDays).toBe(45);
    expect(p.payday.denominator).toBe('take_home');
    expect(DASHBOARD_RED_LINES).toEqual({
      skipRate: 0.1,
      dropOffRate: 0.03,
      timeVsSimilarStems: 2,
      optionShareMax: 0.6,
      optionShareMin: 0.03,
      notApplicableRate: 0.15,
      retestChangeRate: 0.3,
    });
    expect(GO_CRITERIA).toEqual({
      completionRate: 0.7,
      maxItemSkipRate: 0.1,
      retestCorrelation: 0.75,
      dailyOpenDay7Return: 0.25,
      dailyOpenDay30Return: 0.12,
      paydayCompletionShare: 0.5,
    });
  });

  it('the provisional norm is median 0.5 and standard deviation 0.2 for every sector', () => {
    const norm = NORMS['provisional-1'];
    expect(norm.provisional).toBe(true);
    for (const a of AREAS) expect(norm.sectors[a]).toEqual({ median: 0.5, sd: 0.2 });
  });

  it('the questions that daily open and payday replace exist in the bank, with one band per option', () => {
    const p = ALGO_PARAMS[1];
    for (const id of [p.dailyOpen.sleep.itemId, p.dailyOpen.exercise.itemId, p.payday.runwayItemId, p.payday.shareItemId]) {
      expect(bank.items[id]).toBeDefined();
    }
    expect(p.dailyOpen.sleep.midpointHours).toHaveLength(bank.items.B3.versions[0].opts.length);
    const bands = BANK_BANDS[bank.bank_version];
    const optionCounts: Record<string, number> = {
      B3: bank.items.B3.versions[0].opts.length,
      B2: bank.items.B2.versions[0].opts.length,
      W3: bank.items.W3.versions.find((v) => v.key === 'base')!.opts.length,
      'W5:save': bank.items.W5.versions.find((v) => v.key === 'save')!.opts.length,
      'W5:debt': bank.items.W5.versions.find((v) => v.key === 'debt')!.opts.length,
    };
    for (const [name, n] of Object.entries(optionCounts)) {
      const band = bands[name];
      expect(band.lowerEdges).toHaveLength(n);
      expect([...band.optionForBand].sort()).toEqual([...Array(n).keys()]);
      expect([...band.lowerEdges].sort((x, y) => x - y)).toEqual(band.lowerEdges);
    }
  });
});

describe('registry', () => {
  it('CURRENT points at registered versions', () => {
    expect(CURRENT).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
    expect(getAlgo().version).toBe(1);
    expect(getBank()).toBe(bank);
    expect(getNorm()).toBe(NORMS['provisional-1']);
    expect(ALGOS[CURRENT.algo]).toBeDefined();
    expect(BANKS[CURRENT.bank]).toBeDefined();
  });

  it('unknown versions are refused', () => {
    expect(() => getAlgo(99)).toThrow(EngineError);
    expect(() => getBank('9.9')).toThrow(EngineError);
    expect(() => getNorm('none')).toThrow(EngineError);
    expect(() => getBank('toString')).toThrow(EngineError);
  });

  const background = backgroundFor('emp');
  const steps = walk(background, chooseWorst);

  it('every result carries the three versions it was computed with', () => {
    expect(compute({ bank, background, steps }).versions).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
    const explicit = compute({ bank, background, steps, versions: { algo: 1, bank: '2.1', norm: 'provisional-1' } });
    expect(explicit.versions).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
    expect(explicit.normProvisional).toBe(true);
  });

  it('a versions.bank that is not the bank passed in is refused', () => {
    expect(() => compute({ bank, background, steps, versions: { bank: '1.0' } })).toThrow(EngineError);
    expect(() => compute({ bank, background, steps, versions: { algo: 7 } })).toThrow(EngineError);
    expect(() => compute({ bank, background, steps, versions: { norm: 'missing' } })).toThrow(EngineError);
  });

  it('a later algorithm version can sit beside version 1 without changing its results', () => {
    const before = compute({ bank, background, steps });
    const params = structuredClone(ALGO_PARAMS[1]);
    params.sector.ownShare = 0.5;
    params.sector.otherShare = 0.5;
    const v2 = createAlgoV1(2, params);
    const norm = getNorm();
    const changed = v2.compute({ bank, background, steps, versions: { algo: 2, bank: '2.1', norm: 'provisional-1' }, norm });
    expect(changed.versions.algo).toBe(2);
    expect(changed.overall).not.toBe(before.overall);
    expect(compute({ bank, background, steps })).toEqual(before);
    expect(ALGO_PARAMS[1].sector.ownShare).toBe(2 / 3);
  });

  it('a later norm version changes prices and leaves the internal values alone', () => {
    const best = walk(background, chooseBest);
    const base = compute({ bank, background, steps: best });
    const sectors = {} as Record<AreaId, { median: number; sd: number }>;
    for (const a of AREAS) sectors[a] = { median: 0.6, sd: 0.25 };
    const norm: NormSet = { provisional: false, sectors, byRole: { emp: { W: { median: 0.8, sd: 0.1 } } } };
    const versions = { algo: 1, bank: '2.1', norm: 'test-2' };
    const next = getAlgo(1).compute({ bank, background, steps: best, versions, norm });
    expect(next.normProvisional).toBe(false);
    for (const a of AREAS) expect(next.sectors[a].raw).toBe(base.sectors[a].raw);
    // 100 + 15 * (1 - 0.6) / 0.25 = 124, and for wealth the role norm: 100 + 15 * (1 - 0.8) / 0.1 = 130.
    expect(next.sectors.C.price).toBeCloseTo(124, 9);
    expect(next.sectors.W.price).toBeCloseTo(130, 9);
    // A role without its own norm uses the general one.
    const other = backgroundFor('free');
    const otherResult = getAlgo(1).compute({ bank, background: other, steps: walk(other, chooseBest), versions, norm });
    expect(otherResult.sectors.W.price).toBeCloseTo(124, 9);
  });
});
