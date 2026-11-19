// Acceptance D: the skip rules of section 4.3 of the brief. The reference has no skip, so
// every rule here is checked against a hand-built expectation.

import { describe, expect, it } from 'vitest';
import reference from '../../../reference/bank_v2.1.json';
import { compute, nextQuestion, parseBank, progressOf } from '../../../src/engine';
import type { AreaId, Background, ContrastId, FlagId, Result, Step } from '../../../src/engine';
import { AREAS, backgroundFor, bank, bestOption, chooseBest, chooseWorst, situations, walk, withAnswer, worstOption } from './helpers';
import type { Chooser } from './helpers';

type Pick = number | null | 'best' | 'worst';

/** Answers the named questions as given (null skips) and everything else with `rest`. */
function choose(picks: Record<string, Pick>, rest: Chooser = () => 2): Chooser {
  return (q, steps) => {
    if (!(q.id in picks)) return rest(q, steps);
    const pick = picks[q.id];
    return pick === 'best' ? bestOption(q.version) : pick === 'worst' ? worstOption(q.version) : pick;
  };
}

function run(background: Background, picks: Record<string, Pick>, rest?: Chooser): Result {
  return compute({ bank, background, steps: walk(background, choose(picks, rest)) });
}

const flagIds = (r: Result): FlagId[] => r.flags.map((f) => f.id);
const emp = backgroundFor('emp');
const youngEmp = backgroundFor('emp', {}, 0);

describe('a skipped question is asked, has no score, and stays out of the weighted means', () => {
  // The middle option everywhere: W1 gives tier "mid" and C_lvl gives no manager route, which
  // are also the defaults after a skip, so skipping changes nothing but the one answer.
  const base = walk(emp, () => 2);

  it.each(base.map((s) => [s.id]))('skipping %s equals answering an option that is not scored', (id) => {
    const step = base.find((s) => s.id === id)!;
    // The same bank, except that the answered option of this question carries no score.
    const raw = JSON.parse(JSON.stringify(reference));
    const version = raw.items[id].versions.find((v: { key: string }) => v.key === step.key);
    version.s[step.k as number] = null;
    const unscored = compute({ bank: parseBank(raw), background: emp, steps: base });
    const skipped = compute({ bank, background: emp, steps: base.map((s) => (s.id === id ? { ...s, k: null } : s)) });
    expect(skipped.sectors).toEqual(unscored.sectors);
    expect(skipped.overall).toBe(unscored.overall);
    expect(skipped.overallFullWeight).toBe(unscored.overallFullWeight);
  });

  it('counts as asked: the path, the progress and the sector counts keep it', () => {
    const steps = walk(emp, choose({ B2: null, N4: null }));
    expect(steps).toHaveLength(base.length);
    expect(steps.map((s) => s.id)).toEqual(base.map((s) => s.id));
    expect(progressOf(bank, emp, steps)).toEqual({ asked: 34, total: 34, remaining: 0 });
    const result = compute({ bank, background: emp, steps });
    expect(result.counts).toEqual({ total: 34, answered: 32, skipped: 2 });
    expect(result.sectors.B).toMatchObject({ status: 'listed', ownItems: 5, ownScored: 4 });
    expect(result.sectors.N).toMatchObject({ status: 'listed', ownItems: 6, ownScored: 5 });
    const detail = result.steps.find((s) => s.id === 'B2')!;
    expect(detail).toMatchObject({ k: null, answeredK: null, skipped: true, score: null, multiplier: 1 });
  });

  it('is not a score of zero', () => {
    const allBest = walk(emp, chooseBest);
    const skipped = compute({ bank, background: emp, steps: walk(emp, choose({ N1: null }, chooseBest)) });
    const worst = compute({ bank, background: emp, steps: walk(emp, choose({ N1: 'worst' }, chooseBest)) });
    expect(skipped.sectors.N.price).toBeCloseTo(137.5, 9);
    expect(skipped.sectors.N.keep).toBeCloseTo(1, 12);
    expect(worst.sectors.N.price as number).toBeLessThan(135);
    expect(allBest).toHaveLength(34);
  });

  it('resumes after a skip like after an answer', () => {
    const steps = walk(emp, choose({ C_mast: null }));
    for (let n = 0; n < steps.length; n++) {
      const next = nextQuestion(bank, emp, steps.slice(0, n));
      expect(next).toMatchObject({ id: steps[n].id, key: steps[n].key, index: n, total: steps.length });
    }
    expect(nextQuestion(bank, emp, steps)).toBeNull();
  });
});

describe('skipping the first wealth question (W1)', () => {
  it('sets the tier to "sup" when money is support and to "mid" otherwise, in every situation', () => {
    for (const { background, money } of situations()) {
      const steps = walk(background, choose({ W1: null }));
      const result = compute({ bank, background, steps });
      const expected = money === 'sup' ? 'sup' : 'mid';
      expect(result.context.tier).toBe(expected);
      const w2 = steps.find((s) => s.id === 'W2')!;
      expect(w2.key).toBe(expected === 'sup' ? '400s' : '2000');
    }
  });

  it('never yields the high tier, so check f3 cannot fire', () => {
    const answered = run(emp, { W1: 'best', W2: 0 });
    expect(answered.context.tier).toBe('high');
    expect(flagIds(answered)).toContain('f3');
    const skipped = run(emp, { W1: null, W2: 0 });
    expect(skipped.context.tier).toBe('mid');
    expect(flagIds(skipped)).not.toContain('f3');
  });
});

describe('skipping the job-level question (C_lvl)', () => {
  it.each(['emp', 'gig'] as const)('%s: the manager route is off and the paid-skill question follows', (role) => {
    const background = backgroundFor(role);
    const managed = walk(background, choose({ C_lvl: 4 }));
    expect(managed[1].id).toBe('C_team');
    const skipped = walk(background, choose({ C_lvl: null }));
    expect(skipped[1].id).toBe('C_paid');
    expect(skipped.map((s) => s.id)).not.toContain('C_team');
    expect(compute({ bank, background, steps: skipped }).context.mgr).toBe(0);
  });
});

describe('every later question still resolves to a version', () => {
  const all = situations();

  it('after skipping W1 and C_lvl, for every role and money source (303 situations)', () => {
    const seen = new Set<string>();
    for (const { background, money } of all) {
      const full = walk(background, () => 0);
      const steps = walk(background, choose({ W1: null, C_lvl: null }, () => 0));
      expect(steps.length).toBe(progressOf(bank, background, []).total);
      expect(steps.length).toBe(full.length);
      expect(steps.every((s) => bank.items[s.id].versions.some((v) => v.key === s.key))).toBe(true);
      expect(compute({ bank, background, steps }).counts.skipped).toBe(steps.some((s) => s.id === 'C_lvl') ? 2 : 1);
      seen.add(`${background.role}/${money}`);
    }
    // 11 roles; 8 of them are asked about money and so appear with each of its three sources.
    expect(seen.size).toBe(3 + 8 * 3);
  });

  it('after skipping every question', () => {
    for (const { background } of all) {
      const steps = walk(background, () => null);
      expect(steps.length).toBe(progressOf(bank, background, []).total);
      const result = compute({ bank, background, steps });
      for (const a of AREAS) expect(result.sectors[a].status).toBe('insufficient');
      expect(result.overall).toBeNull();
      expect(result.overallFullWeight).toBeNull();
      expect(result.overallCovers).toEqual([]);
      expect(result.rank).toEqual([]);
      expect(result.flags).toEqual([]);
      expect(result.grade).toBe('A');
      expect(result.contrasts).toEqual([]);
      expect(result.socialPosition).toBeNull();
      expect(result.mindAlert).toBe(false);
      expect(result.type).toBeNull();
      expect(result.keepAll).toBe(1);
    }
  });
});

describe('skipping the interest question', () => {
  it('makes no 10% correction', () => {
    const right = run(emp, {}, chooseBest);
    const wrong = run(emp, { C_int: 1 }, chooseBest);
    const dontKnow = run(emp, { C_int: 0 }, chooseBest);
    const skipped = run(emp, { C_int: null }, chooseBest);
    expect(right.interestWrong).toBe(false);
    expect(wrong.interestWrong).toBe(true);
    expect(dontKnow.interestWrong).toBe(true);
    expect(skipped.interestWrong).toBe(false);
    // Every other capability answer is the best one, so without a correction the sector stays at the top.
    expect(skipped.sectors.C.raw).toBeCloseTo(1, 12);
    expect(skipped.sectors.C.price).toBeCloseTo(137.5, 9);
    expect(wrong.sectors.C.price as number).toBeLessThan(skipped.sectors.C.price as number);
  });

  it('the correction, when it applies, moves capability 10% of the way to the median', () => {
    // Same answers scored on a bank where the wrong option is simply not scored: no correction there.
    const steps = walk(emp, choose({ C_int: 1 }, chooseBest));
    const wrong = compute({ bank, background: emp, steps });
    const uncorrected = compute({ bank, background: emp, steps: steps.map((s) => (s.id === 'C_int' ? { ...s, k: null } : s)) });
    // With C_int scored 0 the value is lower than with C_int left out, and then shrunk by 10%.
    const own = steps.filter((s) => bank.items[s.id].area === 'C');
    const weights = own.map((s) => (bank.items[s.id].load.C as number));
    const ownMean = (weights.reduce((a, b) => a + b, 0) - 0.75) / weights.reduce((a, b) => a + b, 0);
    const before = (2 / 3) * ownMean + (1 / 3) * 1;
    expect(wrong.sectors.C.raw).toBeCloseTo(before + 0.1 * (0.5 - before), 12);
    expect(uncorrected.sectors.C.raw).toBeCloseTo(1, 12);
  });
});

describe('skipping the ladder question', () => {
  it('gives no social position and no ladder contrast', () => {
    const low = run(emp, { G1: 4 }, chooseWorst);
    expect(low.socialPosition).toMatchObject({ ladder: 4, ladderRungs: [9, 10], objectiveRung: 1, gap: 8.5, gapKind: 'above' });
    expect(low.contrasts).toContain('c1b');
    const high = run(emp, { G1: 0 }, chooseBest);
    expect(high.socialPosition).toMatchObject({ ladder: 0, ladderRungs: [1, 2], objectiveRung: 10, gap: -8.5, gapKind: 'below' });
    expect(high.contrasts).toContain('c1a');

    for (const rest of [chooseWorst, chooseBest]) {
      const skipped = run(emp, { G1: null }, rest);
      expect(skipped.socialPosition).toBeNull();
      expect(skipped.contrasts).not.toContain('c1a');
      expect(skipped.contrasts).not.toContain('c1b');
      // The sectors themselves are still priced.
      for (const a of AREAS) expect(skipped.sectors[a].status).toBe('listed');
    }
  });

  it('gives no social position when wealth or capability has no price', () => {
    const noWealth = run(emp, { W1: null, W2: null, W3: null, G1: 2 });
    expect(noWealth.sectors.W.status).toBe('insufficient');
    expect(noWealth.socialPosition).toBeNull();
    expect(noWealth.contrasts.filter((c) => c.startsWith('c1'))).toEqual([]);
  });
});

describe('consistency checks do not fire when a question they involve was skipped', () => {
  const stageZero = backgroundFor('emp', { stage: 0 }, 0);
  const seeker = backgroundFor('seek', { exp: 1 });
  const owner = backgroundFor('owner', {}, 0);
  const scenarios: Array<[FlagId, string, Background, Record<string, Pick>, string[]]> = [
    ['f1', 'health very good, 15 or more days limited', emp, { B1: 4, B5: 0 }, ['B1', 'B5']],
    ['f2', 'under 30 minutes a week, runs 10 km', emp, { B2: 0, B4: 5 }, ['B2', 'B4']],
    ['f3', 'high tier, cannot pay an emergency', emp, { W1: 'best', W2: 0 }, ['W1', 'W2']],
    ['f4', 'cannot pay an emergency, savings over 3 months', emp, { W2: 0, W3: 4 }, ['W2', 'W3']],
    ['f5', 'knows 8 to 10 kinds, no help available', emp, { N1: 4, N3: 0 }, ['N1', 'N3']],
    ['f6', "aged 18 to 20 with a master's or higher", youngEmp, { C_deg: 5 }, ['C_deg']],
    ['f7', 'aged 18 to 20, executive with top net worth', youngEmp, { C_lvl: 4, W4: 5 }, ['C_lvl', 'W4']],
    ['f7', 'aged 18 to 20, owner of a company of 100 or more', owner, { C_team: 4 }, ['C_team']],
    ['f8', 'satisfaction 9 to 10, no interest nearly every day', emp, { M1: 4, M4: 0 }, ['M1', 'M4']],
    ['f12', 'under 2 years in the field, known in the field', stageZero, { C_mast: 4 }, ['C_mast']],
    ['f12', 'job seeker with under 2 years, known in the field', seeker, { C_mast: 4 }, ['C_mast']],
  ];

  it.each(scenarios)('%s (%s)', (flag, _name, background, picks, involved) => {
    expect(flagIds(run(background, picks))).toContain(flag);
    for (const id of involved) {
      const skipped = run(background, { ...picks, [id]: null });
      expect(flagIds(skipped)).not.toContain(flag);
    }
  });

  it('covers every check that reads an answer', () => {
    expect(new Set(scenarios.map((s) => s[0]))).toEqual(new Set(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f12']));
  });
});

describe('contrasts do not fire when a question they involve was skipped', () => {
  const facts = (ids: string[], pick: Pick): Record<string, Pick> => Object.fromEntries(ids.map((id) => [id, pick]));
  const money = ['W1', 'W2', 'W3', 'W4', 'W5'];
  const people = ['N1', 'N2', 'N3', 'N4', 'N5'];
  const habits = ['B2', 'B3', 'B4'];
  const scenarios: Array<[ContrastId, Record<string, Pick>, string[]]> = [
    ['c2a', { ...facts(money, 'best'), W6: 'worst' }, [...money, 'W6']],
    ['c2b', { ...facts(money, 'worst'), W6: 'best' }, [...money, 'W6']],
    ['c3a', { ...facts(people, 'best'), N6: 'worst' }, [...people, 'N6']],
    ['c3b', { ...facts(people, 'worst'), N6: 'best' }, [...people, 'N6']],
    ['c4a', { ...facts(habits, 'best'), B1: 'worst', B5: 'worst' }, [...habits, 'B1', 'B5']],
    ['c4b', { ...facts(habits, 'worst'), B1: 'best', B5: 'best' }, [...habits, 'B1', 'B5']],
  ];

  it.each(scenarios)('%s', (contrast, picks, involved) => {
    expect(run(emp, picks).contrasts).toContain(contrast);
    const pair = contrast.slice(0, 2);
    for (const id of involved) {
      const skipped = run(emp, { ...picks, [id]: null });
      expect(skipped.contrasts.filter((c) => c.startsWith(pair))).toEqual([]);
    }
  });

  it('an option that is not scored is different from a skip: the contrast still fires', () => {
    // B4 "not applicable" is an answer. The reference leaves it out of the mean and still compares.
    const picks: Record<string, Pick> = { B2: 'best', B3: 'best', B4: 6, B1: 'worst', B5: 'worst' };
    expect(run(emp, picks).contrasts).toContain('c4a');
  });

  it('the mind contrast compares sector prices, so it needs all five sectors priced', () => {
    const mind = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
    const low = run(emp, facts(mind, 'worst'), chooseBest);
    expect(low.contrasts).toContain('c6a');
    // One skipped mind question leaves the sector priced: the comparison of prices still holds.
    expect(run(emp, { ...facts(mind, 'worst'), M2: null }, chooseBest).contrasts).toContain('c6a');
    // Without a mind price there is nothing to compare.
    const none = run(emp, { ...facts(mind, 'worst'), M1: null, M2: null, M5: null }, chooseBest);
    expect(none.sectors.M.status).toBe('insufficient');
    expect(none.contrasts).not.toContain('c6a');
    // Without one of the other four there is nothing to compare either.
    const noBody = run(emp, { ...facts(mind, 'worst'), B1: null, B2: null, B3: null }, chooseBest);
    expect(noBody.sectors.B.status).toBe('insufficient');
    expect(noBody.contrasts).not.toContain('c6a');
  });

  it('the mind notice needs both mood answers', () => {
    expect(run(emp, { M3: 0, M4: 0 }).mindAlert).toBe(true);
    expect(run(emp, { M3: null, M4: 0 }).mindAlert).toBe(false);
    expect(run(emp, { M3: 0, M4: null }).mindAlert).toBe(false);
    expect(run(emp, { M3: 0, M4: 1 }).mindAlert).toBe(false);
  });
});

describe('skipping by itself does not affect the data grade', () => {
  const skipSome: Record<string, Pick> = { C_dig: null, W4: null, N2: null, B3: null, M5: null, G1: null };

  it('no check fires for skipping, however many and however fast', () => {
    const base = run(emp, {});
    expect(base.flags).toEqual([]);
    expect(base.grade).toBe('A');
    const steps = walk(emp, choose(skipSome)).map((s): Step => (s.k === null ? { ...s, secs: 0.05 } : { ...s, secs: 30 }));
    const result = compute({ bank, background: emp, steps });
    expect(result.counts.skipped).toBe(6);
    expect(result.flags).toEqual([]);
    expect(result.flagPoints).toBe(0);
    expect(result.grade).toBe('A');
    // A fast skip is not a fast answer: nothing is counted at reduced weight.
    expect(result.keepAll).toBe(1);
    expect(result.reducedWeight.count).toBe(0);
    for (const detail of result.steps.filter((s) => s.skipped)) {
      expect(detail).toMatchObject({ timeMultiplier: 1, multiplier: 1, score: null });
    }
  });

  it('keepAll is the mean over the answered questions; check f10 still sees a rushed session with skips', () => {
    const fast = (skips: Record<string, Pick>): Result => {
      const steps = walk(emp, choose(skips)).map((s): Step => ({ ...s, secs: 0.01 }));
      return compute({ bank, background: emp, steps });
    };
    const all = fast({});
    expect(all.keepAll).toBe(0.5);
    expect(all.flags).toContainEqual({ id: 'f10', points: 1 });
    // 28 answers at 0.5 and 6 skips: keepAll, shown on the result page, stays 0.5. Check f10
    // reads (28 * 0.5 + 6) / 34 = 0.588, still under 0.7.
    const withSkips = fast(skipSome);
    expect(withSkips.keepAll).toBe(0.5);
    expect(withSkips.flags).toEqual(all.flags);
    expect(withSkips.grade).toBe(all.grade);
  });

  it('check f11 still sees one tap position on nearly every question asked', () => {
    const tap = (skips: Record<string, Pick>, where: 'first' | 'middle'): Result => {
      const steps = walk(emp, choose(skips)).map((s): Step => (s.k === null ? s : { ...s, where }));
      return compute({ bank, background: emp, steps });
    };
    expect(flagIds(tap({}, 'first'))).toContain('f11');
    // 28 of the 34 questions asked were answered on the first position: 82%, above 80%.
    expect(flagIds(tap(skipSome, 'first'))).toContain('f11');
    expect(flagIds(tap(skipSome, 'middle'))).not.toContain('f11');
  });

  // Brief 4.3: "skipping by itself does not affect the data grade". Replacing an answer with
  // a skip must never add a check. f10 and f11 are shares, so they are taken over the
  // questions asked: dropping an answer from the denominator could otherwise push a share
  // over its line.
  it('f11: skipping one question does not turn grade A into grade B', () => {
    // 34 answers, 27 of them on the first display position: 79.4%, under the 80% line.
    const answered = walk(emp, () => 2).map((s, i): Step => ({ ...s, secs: 30, where: i < 27 ? 'first' : 'middle' }));
    const before = compute({ bank, background: emp, steps: answered });
    expect(before.flags).toEqual([]);
    expect(before.grade).toBe('A');
    // The same session, except that the ladder (tapped in the middle) is skipped. Over the
    // answered questions alone the share would be 27 of 33, 81.8%.
    const after = compute({ bank, background: emp, steps: withAnswer(answered, 'G1', null) });
    expect(after.counts.skipped).toBe(1);
    expect(after.flags).toEqual([]);
    expect(after.grade).toBe('A');
  });

  it('f11: two answers on the first position and 32 skips is not "always the first position"', () => {
    const steps = walk(emp, (_q, done) => (done.length < 2 ? 2 : null)).map(
      (s): Step => (s.k === null ? s : { ...s, secs: 30, where: 'first' }),
    );
    const result = compute({ bank, background: emp, steps });
    expect(result.counts).toEqual({ total: 34, answered: 2, skipped: 32 });
    expect(result.flags).toEqual([]);
    expect(result.grade).toBe('A');
  });

  it('f10: skipping a question that was answered slowly does not add the speeding check', () => {
    // 20 answers at the floor (0.5) and 14 at full weight: mean 0.706, no f10.
    // B2 = 0 with B4 = 5 fires f2 (1 point), so the grade is A with one point.
    let answered = walk(emp, () => 2).map((s, i): Step => ({ ...s, where: 'middle', secs: i < 20 ? 0.01 : 30 }));
    answered = withAnswer(withAnswer(answered, 'B2', 0), 'B4', 5);
    const before = compute({ bank, background: emp, steps: answered });
    expect(flagIds(before)).toEqual(['f2']);
    expect(before.grade).toBe('A');
    // Skip the ladder, which was answered slowly. Over the answered questions alone the mean
    // falls to 23 / 33 = 0.697, f10 would fire and the grade would be B.
    const after = compute({ bank, background: emp, steps: withAnswer(answered, 'G1', null) });
    expect(after.keepAll).toBeCloseTo(23 / 33, 12);
    expect(flagIds(after)).toEqual(['f2']);
    expect(after.grade).toBe('A');
  });

  it('replacing any one answer with a skip never adds a check or lowers the grade', () => {
    const order = { A: 0, B: 1, C: 2 };
    // Sessions close to the lines of f10 and f11, with other checks in play.
    const sessions: Step[][] = [
      walk(emp, () => 2).map((s, i): Step => ({ ...s, secs: i < 20 ? 0.01 : 30, where: i < 27 ? 'first' : 'last' })),
      walk(emp, chooseBest).map((s, i): Step => ({ ...s, secs: i % 5 === 0 ? 30 : 0.2, where: i < 28 ? 'last' : 'middle' })),
      walk(youngEmp, (q) => q.version.opts.length - 1).map((s, i): Step => ({ ...s, secs: i < 21 ? 0.3 : 5, where: 'first' })),
    ];
    let compared = 0;
    for (const steps of sessions) {
      const background = steps === sessions[2] ? youngEmp : emp;
      const before = compute({ bank, background, steps });
      for (const step of steps) {
        const after = compute({ bank, background, steps: withAnswer(steps, step.id, null) });
        const added = flagIds(after).filter((id) => !flagIds(before).includes(id));
        expect(added, `skipping ${step.id}`).toEqual([]);
        expect(order[after.grade], `skipping ${step.id}`).toBeLessThanOrEqual(order[before.grade]);
        expect(after.flagPoints).toBeLessThanOrEqual(before.flagPoints);
        compared++;
      }
    }
    expect(compared).toBe(34 * 3);
  });
});

describe('a question that was not reached yet is not an answer', () => {
  it('one answer into the questionnaire fires nothing: f9, f10 and f11 wait for the rest', () => {
    const first = walk(emp, chooseBest).slice(0, 1).map((s): Step => ({ ...s, secs: 0.01, where: 'first' }));
    const result = compute({ bank, background: emp, steps: first });
    expect(result.counts).toEqual({ total: 34, answered: 1, skipped: 0 });
    // The one answer was the best option, on the first position, in 10 ms.
    expect(result.keepAll).toBe(0.5);
    expect(result.flags).toEqual([]);
    expect(result.grade).toBe('A');
  });

  it('f9 fires only once every question on the path has its best answer', () => {
    const full = walk(emp, chooseBest);
    for (const n of [1, 10, 33]) expect(flagIds(compute({ bank, background: emp, steps: full.slice(0, n) }))).not.toContain('f9');
    expect(flagIds(compute({ bank, background: emp, steps: full }))).toEqual(['f9']);
  });

  it('a finished session without a skip is graded exactly as before', () => {
    // The reference has neither skips nor unfinished sessions; there the two readings agree.
    const steps = walk(emp, () => 2).map((s, i): Step => ({ ...s, secs: i < 25 ? 0.01 : 30, where: i < 28 ? 'first' : 'middle' }));
    const result = compute({ bank, background: emp, steps });
    expect(result.keepAll).toBeCloseTo((25 * 0.5 + 9) / 34, 12);
    expect(result.flags).toEqual([
      { id: 'f10', points: 1 },
      { id: 'f11', points: 2 },
    ]);
    expect(result.grade).toBe('B');
  });
});

describe('check f9 (the best option on every question)', () => {
  it('fires only when nothing was skipped', () => {
    expect(flagIds(run(emp, {}, chooseBest))).toEqual(['f9']);
    for (const id of ['C_lvl', 'W1', 'N3', 'B4', 'M6', 'G1']) {
      expect(flagIds(run(emp, { [id]: null }, chooseBest))).not.toContain('f9');
    }
  });

  it('does not fire on the option that is not scored either', () => {
    expect(flagIds(run(emp, { B4: 6 }, chooseBest))).not.toContain('f9');
  });
});

describe('a sector needs 60% of its own questions scored', () => {
  const body = ['B1', 'B2', 'B3', 'B4', 'B5'];
  const mind = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  const skip = (ids: string[]): Record<string, Pick> => Object.fromEntries(ids.map((id) => [id, null]));

  it('3 of 5 is enough, 2 of 5 is not', () => {
    const three = run(emp, skip(body.slice(0, 2)));
    expect(three.sectors.B).toMatchObject({ status: 'listed', ownItems: 5, ownScored: 3 });
    expect(three.sectors.B.price).not.toBeNull();
    const two = run(emp, skip(body.slice(0, 3)));
    expect(two.sectors.B).toEqual({
      status: 'insufficient',
      price: null,
      priceFullWeight: null,
      keep: null,
      raw: null,
      ownItems: 5,
      ownScored: 2,
    });
  });

  it('4 of 6 is enough, 3 of 6 is not', () => {
    expect(run(emp, skip(mind.slice(0, 2))).sectors.M.status).toBe('listed');
    expect(run(emp, skip(mind.slice(0, 3))).sectors.M.status).toBe('insufficient');
  });

  it('an answer that is not scored counts against the 60% like a skip', () => {
    expect(run(emp, { ...skip(body.slice(0, 2)), B4: 6 }).sectors.B.status).toBe('insufficient');
  });

  it('the overall price is the mean of the priced sectors and records which were left out', () => {
    const result = run(emp, skip(body.slice(0, 3)));
    const pricedAreas: AreaId[] = ['C', 'W', 'N', 'M'];
    const mean = pricedAreas.reduce((sum, a) => sum + (result.sectors[a].price as number), 0) / 4;
    expect(result.overall).toBeCloseTo(mean, 12);
    expect(result.overallCovers).toEqual(pricedAreas);
    expect(result.overallLeftOut).toEqual(['B']);
    expect(result.rank).toHaveLength(4);
    expect(result.rank).not.toContain('B');
    expect(result.market.tags.B).toBeNull();
    expect(result.market.pricedCount).toBe(4);
  });

  it('three priced sectors still give an overall price, two do not', () => {
    const three = run(emp, { ...skip(body), ...skip(mind) });
    expect(three.overallCovers).toEqual(['C', 'W', 'N']);
    expect(three.overall).not.toBeNull();
    expect(three.overallFullWeight).not.toBeNull();
    const two = run(emp, { ...skip(body), ...skip(mind), ...skip(['N1', 'N2', 'N3', 'N4', 'N5', 'N6']) });
    expect(two.sectors.C.status).toBe('listed');
    expect(two.sectors.W.status).toBe('listed');
    expect(two.overall).toBeNull();
    expect(two.overallFullWeight).toBeNull();
    expect(two.overallCovers).toEqual([]);
    expect(two.overallLeftOut).toEqual(['N', 'B', 'M']);
    expect(two.reducedWeight.points).toBeNull();
    // The two priced sectors are still ranked and shown.
    expect(two.rank).toHaveLength(2);
  });

  it('a questionnaire that stopped half way prices only the sectors that were reached', () => {
    const full = walk(emp, () => 2);
    const firstWealth = full.findIndex((s) => s.id === 'W1');
    const partial = compute({ bank, background: emp, steps: full.slice(0, firstWealth + 2) });
    expect(partial.sectors.C.status).toBe('listed');
    expect(partial.sectors.W).toMatchObject({ status: 'insufficient', ownItems: 6, ownScored: 2 });
    expect(partial.sectors.M.status).toBe('insufficient');
    expect(partial.overall).toBeNull();
    expect(partial.counts).toEqual({ total: 34, answered: firstWealth + 2, skipped: 0 });
  });
});
