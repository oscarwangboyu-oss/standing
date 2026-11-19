// Acceptance E (part): hooks for later phases. Overrides replace the answer of one question
// with data from another source; extras add a synthetic item to a sector.

import { describe, expect, it } from 'vitest';
import { EngineError, SOURCES, compute, contextOf, nextQuestion } from '../../../src/engine';
import type { AreaId, Background, Extra, Override, Step } from '../../../src/engine';
import { AREAS, backgroundFor, bank, chooseBest, walk, withAnswer } from './helpers';

const emp = backgroundFor('emp');
const middle = walk(emp, () => 2);
const best = walk(emp, chooseBest);
const sectorsOf = (steps: readonly Step[], overrides?: Override[], extras?: Extra[]) =>
  compute({ bank, background: emp, steps, overrides, extras }).sectors;

describe('overrides', () => {
  const sleep: Override = { itemId: 'B3', k: 3, source: 'daily_open' };

  it('replace the option index of the question', () => {
    const answered = withAnswer(middle, 'B3', 3);
    expect(sectorsOf(middle, [sleep])).toEqual(sectorsOf(answered));
    expect(sectorsOf(middle, [sleep]).B.price).not.toBe(sectorsOf(middle).B.price);
  });

  it('count at full weight whatever the time of the questionnaire answer', () => {
    const hasty = middle.map((s): Step => (s.id === 'B3' ? { ...s, secs: 0.01 } : s));
    expect(compute({ bank, background: emp, steps: hasty }).sectors.B.keep as number).toBeLessThan(1);
    const result = compute({ bank, background: emp, steps: hasty, overrides: [sleep] });
    expect(result.sectors).toEqual(sectorsOf(withAnswer(middle, 'B3', 3)));
    expect(result.sectors.B.keep).toBe(1);
    expect(result.reducedWeight.count).toBe(0);
    expect(result.steps.find((s) => s.id === 'B3')).toMatchObject({
      k: 3,
      answeredK: 2,
      overridden: true,
      multiplier: 1,
      timeMultiplier: 0.5,
      source: 'daily_open',
    });
  });

  it('apply even when the questionnaire answer was skipped', () => {
    const skipped = withAnswer(middle, 'B3', null);
    const result = compute({ bank, background: emp, steps: skipped, overrides: [sleep] });
    expect(result.sectors).toEqual(sectorsOf(withAnswer(middle, 'B3', 3)));
    expect(result.sectors.B).toMatchObject({ ownItems: 5, ownScored: 5 });
    expect(result.steps.find((s) => s.id === 'B3')).toMatchObject({ k: 3, answeredK: null, skipped: true, overridden: true });
    // The questionnaire itself still has one skipped question.
    expect(result.counts.skipped).toBe(1);
  });

  it('carry their source, and other steps keep theirs', () => {
    const payday: Override[] = [
      { itemId: 'W3', k: 4, source: 'payday' },
      { itemId: 'B2', k: 0, source: 'connected' },
    ];
    const result = compute({ bank, background: emp, steps: middle, overrides: payday });
    const sources = Object.fromEntries(result.steps.map((s) => [s.id, s.source]));
    expect(sources.W3).toBe('payday');
    expect(sources.B2).toBe('connected');
    expect(Object.entries(sources).filter(([id]) => id !== 'W3' && id !== 'B2').every(([, s]) => s === 'questionnaire')).toBe(true);
  });

  it('use the version the person was shown', () => {
    // High tier: W5 asked as the saving share, lowest option scores 0.35. Otherwise as the debt share, 0.
    const high = walk(emp, (q) => (q.id === 'W1' ? 6 : 2));
    expect(high.find((s) => s.id === 'W5')?.key).toBe('save');
    const share: Override = { itemId: 'W5', k: 0, source: 'payday' };
    const asSave = compute({ bank, background: emp, steps: high, overrides: [share] });
    expect(asSave.steps.find((s) => s.id === 'W5')).toMatchObject({ key: 'save', score: 0.35 });
    const asDebt = compute({ bank, background: emp, steps: middle, overrides: [share] });
    expect(asDebt.steps.find((s) => s.id === 'W5')).toMatchObject({ key: 'debt', score: 0 });
  });

  it('do not change the route or the questionnaire record', () => {
    const before = compute({ bank, background: emp, steps: middle });
    const after = compute({ bank, background: emp, steps: middle, overrides: [{ itemId: 'W1', k: 6, source: 'payday' }] });
    expect(after.context).toEqual(before.context);
    expect(after.steps.map((s) => [s.id, s.key])).toEqual(before.steps.map((s) => [s.id, s.key]));
    expect(after.keepAll).toBe(before.keepAll);
    expect(after.counts).toEqual(before.counts);
  });

  it('leave the consistency checks on the questionnaire answers', () => {
    // f2: under 30 minutes a week and able to run 10 km. Daily data replaces the exercise answer for the price only.
    const steps = withAnswer(withAnswer(middle, 'B2', 0), 'B4', 5);
    const plain = compute({ bank, background: emp, steps });
    const replaced = compute({ bank, background: emp, steps, overrides: [{ itemId: 'B2', k: 4, source: 'daily_open' }] });
    expect(plain.flags).toEqual([{ id: 'f2', points: 1 }]);
    expect(replaced.flags).toEqual(plain.flags);
    expect(replaced.grade).toBe(plain.grade);
    expect(replaced.sectors.B.price as number).toBeGreaterThan(plain.sectors.B.price as number);
    // f9 looks at what was answered: one replaced answer does not undo "the best option everywhere".
    const stillAllBest = compute({ bank, background: emp, steps: best, overrides: [{ itemId: 'B3', k: 0, source: 'daily_open' }] });
    expect(stillAllBest.flags).toEqual([{ id: 'f9', points: 1 }]);
  });

  it('feed the contrasts', () => {
    // Everything about the body answered at the low end: no contrast. Then the habits are
    // replaced by good daily data while rated health stays low: contrast c4a appears.
    const steps = ['B1', 'B2', 'B3', 'B4', 'B5'].reduce((list, id) => withAnswer(list, id, 0), middle);
    expect(compute({ bank, background: emp, steps }).contrasts.filter((c) => c.startsWith('c4'))).toEqual([]);
    const daily: Override[] = [
      { itemId: 'B2', k: 4, source: 'daily_open' },
      { itemId: 'B3', k: 3, source: 'daily_open' },
      { itemId: 'B4', k: 5, source: 'connected' },
    ];
    expect(compute({ bank, background: emp, steps, overrides: daily }).contrasts).toContain('c4a');
  });

  it('the last override of a question wins', () => {
    const twice: Override[] = [
      { itemId: 'B3', k: 0, source: 'daily_open' },
      { itemId: 'B3', k: 3, source: 'connected' },
    ];
    const result = compute({ bank, background: emp, steps: middle, overrides: twice });
    expect(result.sectors).toEqual(sectorsOf(middle, [sleep]));
    expect(result.steps.find((s) => s.id === 'B3')?.source).toBe('connected');
  });

  it('are ignored for a question that is not on the path', () => {
    // An employee is not asked C_exp (students only).
    const result = compute({ bank, background: emp, steps: middle, overrides: [{ itemId: 'C_exp', k: 4, source: 'connected' }] });
    expect(result).toEqual(compute({ bank, background: emp, steps: middle, overrides: [] }));
  });

  it('are refused when they name an unknown question, option or source', () => {
    const bad = (override: Override) => () => compute({ bank, background: emp, steps: middle, overrides: [override] });
    expect(bad({ itemId: 'B9', k: 0, source: 'daily_open' })).toThrow(EngineError);
    expect(bad({ itemId: 'B3', k: 5, source: 'daily_open' })).toThrow(EngineError);
    expect(bad({ itemId: 'B3', k: -1, source: 'daily_open' })).toThrow(EngineError);
    expect(bad({ itemId: 'B3', k: 1.5, source: 'daily_open' })).toThrow(EngineError);
    expect(bad({ itemId: 'B3', k: 1, source: 'guess' as Override['source'] })).toThrow(EngineError);
  });
});

describe('extras', () => {
  const state = (score: number, load: Extra['load'] = { M: 1 }): Extra => ({
    id: 'daily_state',
    area: 'M',
    load,
    score,
    source: 'daily_open',
  });

  /** Sum of the loads on `area` over the questions of other sectors in a session. */
  const otherWeight = (steps: readonly Step[], area: AreaId): number =>
    steps.reduce((sum, s) => {
      const item = bank.items[s.id];
      const version = item.versions.find((v) => v.key === s.key)!;
      return item.area === area ? sum : sum + ((version.load ?? item.load)[area] ?? 0);
    }, 0);

  it('enter the weighted mean of their own sector at full weight', () => {
    // All best: the six mind questions (load 1 each) score 1, the extra scores 0.
    const result = compute({ bank, background: emp, steps: best, extras: [state(0)] });
    const expectedRaw = (2 / 3) * (6 / 7) + (1 / 3) * 1;
    expect(result.sectors.M.raw).toBeCloseTo(expectedRaw, 12);
    expect(result.sectors.M.price).toBeCloseTo(100 + (15 * (expectedRaw - 0.5)) / 0.2, 9);
    expect(result.sectors.M.keep).toBeCloseTo(1, 12);
    expect(result.sectors.M).toMatchObject({ ownItems: 7, ownScored: 7 });
    // The other sectors do not move.
    for (const a of ['C', 'W', 'N', 'B'] as const) expect(result.sectors[a].price).toBeCloseTo(137.5, 9);
    expect(result.extras).toEqual([{ id: 'daily_state', area: 'M', source: 'daily_open', counted: true }]);
  });

  it('a score between the options is taken as it is', () => {
    const result = compute({ bank, background: emp, steps: best, extras: [state(0.62)] });
    expect(result.sectors.M.raw).toBeCloseTo((2 / 3) * ((6 + 0.62) / 7) + 1 / 3, 12);
  });

  it('count at full weight even when the questionnaire was rushed', () => {
    // Every answer at the floor (multiplier 0.5), all best. Own part: (6 * 0.5 * 1 + 1 * 0) / (6 * 0.5 + 1).
    const rushed = best.map((s): Step => ({ ...s, secs: 0.01 }));
    const result = compute({ bank, background: emp, steps: rushed, extras: [state(0)] });
    const value = (2 / 3) * (3 / 4) + (1 / 3) * 1;
    const keep = (2 / 3) * (4 / 7) + (1 / 3) * 0.5;
    expect(result.sectors.M.keep).toBeCloseTo(keep, 12);
    expect(result.sectors.M.raw).toBeCloseTo(keep * value + (1 - keep) * 0.5, 12);
  });

  it('load on other sectors like a bank question does', () => {
    const result = compute({ bank, background: emp, steps: best, extras: [state(0, { M: 1, B: 0.5 })] });
    const others = otherWeight(best, 'B');
    expect(others).toBeGreaterThan(0);
    expect(result.sectors.B.raw).toBeCloseTo(2 / 3 + (1 / 3) * (others / (others + 0.5)), 12);
    expect(result.sectors.B).toMatchObject({ ownItems: 5, ownScored: 5 });
  });

  it('count as one of the sector\'s own questions for the 60% rule', () => {
    const skipThree = best.map((s): Step => (['M1', 'M2', 'M3'].includes(s.id) ? { ...s, k: null } : s));
    expect(compute({ bank, background: emp, steps: skipThree }).sectors.M).toMatchObject({ status: 'insufficient', ownItems: 6, ownScored: 3 });
    // 4 of 7 scored is still under 60%.
    expect(compute({ bank, background: emp, steps: skipThree, extras: [state(1)] }).sectors.M).toMatchObject({
      status: 'insufficient',
      ownItems: 7,
      ownScored: 4,
    });
    // A second extra makes it 5 of 8.
    const two = [state(1), { ...state(1), id: 'daily_state_2' }];
    expect(compute({ bank, background: emp, steps: skipThree, extras: two }).sectors.M).toMatchObject({
      status: 'listed',
      ownItems: 8,
      ownScored: 5,
    });
  });

  it('do not touch the questionnaire record: checks, grade, keepAll and counts stay', () => {
    const plain = compute({ bank, background: emp, steps: best });
    const withExtra = compute({ bank, background: emp, steps: best, extras: [state(0)] });
    expect(withExtra.flags).toEqual(plain.flags);
    expect(withExtra.keepAll).toBe(plain.keepAll);
    expect(withExtra.counts).toEqual(plain.counts);
    expect(withExtra.steps).toEqual(plain.steps);
  });

  it('are refused when malformed', () => {
    const bad = (extra: Extra) => () => compute({ bank, background: emp, steps: best, extras: [extra] });
    expect(bad(state(1.2))).toThrow(EngineError);
    expect(bad(state(-0.1))).toThrow(EngineError);
    expect(bad(state(Number.NaN))).toThrow(EngineError);
    expect(bad({ ...state(1), id: '' })).toThrow(EngineError);
    expect(bad({ ...state(1), id: 'M1' })).toThrow(EngineError);
    expect(bad({ ...state(1), area: 'G' as AreaId })).toThrow(EngineError);
    expect(bad({ ...state(1), load: { M: -1 } })).toThrow(EngineError);
    expect(bad({ ...state(1), source: 'nowhere' as Extra['source'] })).toThrow(EngineError);
    expect(() => compute({ bank, background: emp, steps: best, extras: [state(1), state(0)] })).toThrow(EngineError);
  });

  it('are refused without a load on their own sector', () => {
    // Brief 9: the state item is a mind item with load 1. An extra whose load misses its own
    // sector would be dropped from that sector in silence and still be reported as counted.
    const bad = (load: Extra['load']) => () => compute({ bank, background: emp, steps: best, extras: [state(0, load)] });
    expect(bad({})).toThrow(EngineError);
    expect(bad({})).toThrow(/load above 0 on its own sector M/);
    expect(bad({ M: 0 })).toThrow(EngineError);
    expect(bad({ B: 1 })).toThrow(EngineError);
    expect(bad({ M: Number.NaN })).toThrow(EngineError);
    // A load on the own sector and on another one is fine.
    expect(bad({ M: 0.5, B: 1 })).not.toThrow();
    // The check comes before consent: a malformed extra is refused even for an excluded sector.
    expect(() =>
      compute({ bank, background: emp, steps: best, excludedAreas: ['M'], extras: [state(0, {})] }),
    ).toThrow(EngineError);
  });
});

describe('input the engine cannot score is refused, not guessed at', () => {
  const step = middle[0];
  const withStep = (change: Partial<Step>): Step[] => [{ ...step, ...change }, ...middle.slice(1)];

  it.each([
    ['an unknown question', withStep({ id: 'Q1' })],
    ['a question id that is a property of every object', withStep({ id: 'constructor' })],
    ['an unknown version', withStep({ key: 'nope' })],
    ['an option outside the version', withStep({ k: 99 })],
    ['a negative option', withStep({ k: -1 })],
    ['a fractional option', withStep({ k: 0.5 })],
    ['a time that is not a number', withStep({ secs: Number.NaN })],
    ['a missing language', withStep({ lang: 'fr' as Step['lang'] })],
  ])('steps with %s', (_name, steps) => {
    expect(() => compute({ bank, background: emp, steps })).toThrow(EngineError);
    expect(() => nextQuestion(bank, emp, steps)).toThrow(EngineError);
  });

  it.each([
    ['an unknown role', { ...emp, role: 'boss' as Background['role'] }],
    ['a missing background answer', { ...emp, extra: {} }],
    ['a background answer out of range', { ...emp, extra: { ...emp.extra, field: 14 } }],
    // `stage` routes nothing, but check f12 reads it. The reference page cannot start without it.
    ['a missing answer to a background question that routes nothing', { ...emp, extra: { field: 0 } }],
    ['an out-of-range answer to such a question', { ...emp, extra: { ...emp.extra, stage: 5 } }],
    ['a fractional background answer', { ...emp, extra: { ...emp.extra, stage: 0.5 } }],
    ['no background answers at all', { age: 2, role: 'emp' } as unknown as Background],
  ])('a background with %s', (_name, background) => {
    expect(() => compute({ bank, background, steps: [] })).toThrow(EngineError);
    expect(() => nextQuestion(bank, background, [])).toThrow(EngineError);
  });

  it('every background question of every role is required', () => {
    for (const role of bank.roles) {
      const full = backgroundFor(role.id);
      expect(() => contextOf(bank, full)).not.toThrow();
      for (const question of bank.extra[role.id]) {
        const extra = { ...full.extra };
        delete extra[question.id];
        expect(() => contextOf(bank, { ...full, extra }), `${role.id} without ${question.id}`).toThrow(EngineError);
        expect(() => compute({ bank, background: { ...full, extra }, steps: [] })).toThrow(EngineError);
      }
    }
  });

  it('with the background complete, check f12 can fire', () => {
    const fifth = (q: { version: { opts: unknown[] } }): number => Math.min(4, q.version.opts.length - 1);
    const underTwoYears = backgroundFor('emp', { stage: 0 });
    expect(compute({ bank, background: underTwoYears, steps: walk(underTwoYears, fifth) }).flags.map((f) => f.id)).toContain('f12');
    const longer = backgroundFor('emp', { stage: 2 });
    expect(compute({ bank, background: longer, steps: walk(longer, fifth) }).flags.map((f) => f.id)).not.toContain('f12');
  });

  it('answered questionnaire steps without a tap position are counted in positionsMissing', () => {
    // Without `where`, check f11 cannot see the position and the data grade may be too good.
    // The result says how many positions are missing, so the caller can tell.
    const bare = walk(emp, () => 2);
    expect(bare.every((s) => s.where === undefined)).toBe(true);
    const silent = compute({ bank, background: emp, steps: bare });
    expect(silent.positionsMissing).toBe(34);
    expect(silent.flags.map((f) => f.id)).not.toContain('f11');
    const complete = compute({ bank, background: emp, steps: bare.map((s): Step => ({ ...s, where: 'first' })) });
    expect(complete.positionsMissing).toBe(0);
    expect(complete.flags.map((f) => f.id)).toContain('f11');
    // A skipped question has no tap, and a step from another source is not a questionnaire tap.
    const mixed = bare.map((s, i): Step => (i === 0 ? { ...s, k: null } : i === 1 ? { ...s, source: 'connected' } : { ...s, where: 'middle' }));
    expect(compute({ bank, background: emp, steps: mixed }).positionsMissing).toBe(0);
    // An unfinished session counts only the answers given.
    expect(compute({ bank, background: emp, steps: bare.slice(0, 5) }).positionsMissing).toBe(5);
  });

  it('an age group that does not exist', () => {
    expect(() => compute({ bank, background: { ...emp, age: 6 }, steps: middle })).toThrow(EngineError);
    expect(() => compute({ bank, background: { ...emp, age: -1 }, steps: middle })).toThrow(EngineError);
  });

  it('an excluded sector that does not exist', () => {
    const excludedAreas = ['G'] as unknown as AreaId[];
    expect(() => compute({ bank, background: emp, steps: middle, excludedAreas })).toThrow(EngineError);
    expect(() => nextQuestion(bank, emp, [], { excludedAreas })).toThrow(EngineError);
  });

  it('a repeated step for one question counts once, the first time', () => {
    const repeated = [...middle, { ...middle[3], k: 0 }];
    expect(compute({ bank, background: emp, steps: repeated })).toEqual(compute({ bank, background: emp, steps: middle }));
  });

  it('a step for a question that is not on the path is ignored', () => {
    const stray: Step = { id: 'C_exp', key: 'base', k: 4, secs: null, lang: 'zh', source: 'questionnaire' };
    expect(compute({ bank, background: emp, steps: [...middle, stray] })).toEqual(compute({ bank, background: emp, steps: middle }));
    expect(nextQuestion(bank, emp, [stray])?.id).toBe('C_lvl');
  });
});

describe('sources', () => {
  it('every scored input carries one', () => {
    const result = compute({
      bank,
      background: emp,
      steps: middle,
      overrides: [{ itemId: 'B3', k: 3, source: 'daily_open' }],
      extras: [{ id: 'daily_state', area: 'M', load: { M: 1 }, score: 0.5, source: 'daily_open' }],
    });
    for (const step of result.steps) expect(SOURCES).toContain(step.source);
    expect(SOURCES).toEqual(['questionnaire', 'daily_open', 'payday', 'weekly_win', 'people_nudge', 'connected']);
    // The micro apps for capability and network use the same hooks.
    const weekly = compute({
      bank,
      background: emp,
      steps: middle,
      overrides: [{ itemId: 'C_learn', k: 4, source: 'weekly_win' }],
      extras: [{ id: 'people_reached', area: 'N', load: { N: 1 }, score: 1, source: 'people_nudge' }],
    });
    expect(weekly.steps.find((s) => s.id === 'C_learn')?.source).toBe('weekly_win');
    expect(weekly.extras[0]).toMatchObject({ source: 'people_nudge', counted: true });
    for (const extra of result.extras) expect(extra.source).toBe('daily_open');
    expect(() => compute({ bank, background: emp, steps: middle.map((s) => ({ ...s, source: 'x' as Step['source'] })) })).toThrow(EngineError);
  });

  it('compute does not change its input', () => {
    const steps = middle.map((s) => Object.freeze({ ...s }));
    const overrides = [Object.freeze({ itemId: 'B3', k: 3, source: 'daily_open' } as Override)];
    const background = Object.freeze({ ...emp, extra: Object.freeze({ ...emp.extra }) });
    const first = compute({ bank, background, steps: Object.freeze(steps), overrides: Object.freeze(overrides) });
    const second = compute({ bank, background, steps: Object.freeze(steps), overrides: Object.freeze(overrides) });
    expect(second).toEqual(first);
    for (const a of AREAS) expect(first.sectors[a].status).toBe('listed');
  });
});
