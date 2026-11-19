// The consistency checks, contrasts and the mind notice read questions and options of the
// bank by position (src/engine/algo/v1/rules.ts). These tests pin every position to the
// option text it stands for in bank 2.1, in every version of the question. A bank edit that
// reorders or rewords one of these options fails here instead of silently changing a rule.

import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, compute } from '../../../src/engine';
import type { Step } from '../../../src/engine';
import { RULES } from '../../../src/engine/algo/v1/rules';
import type { OptionRef } from '../../../src/engine/algo/v1/rules';
import { backgroundFor, bank, walk } from './helpers';

/** English text of the option in every version of the question. */
function texts(ref: OptionRef): string[] {
  return bank.items[ref.id].versions.map((v) => v.opts[ref.option].en);
}

/** The option reads the same in every version of the question. */
function everyVersion(ref: OptionRef, text: string): void {
  expect(texts(ref), `${ref.id} option ${ref.option}`).toEqual(bank.items[ref.id].versions.map(() => text));
}

describe('rules.ts against the option texts of bank 2.1', () => {
  const c = RULES.checks;

  it('f1: "Very good" health or better, with 15 or more days limited', () => {
    everyVersion(c.f1.healthVeryGoodOrBetter, 'Very good');
    // "or better" is the options after it: there is exactly one, and it scores higher.
    const health = bank.items.B1.versions[0];
    expect(health.opts.map((o) => o.en).slice(c.f1.healthVeryGoodOrBetter.option)).toEqual(['Very good', 'Excellent']);
    everyVersion(c.f1.limitedFifteenDaysOrMore, '15 or more');
  });

  it('f2: under 30 minutes of activity a week, and able to run 10 km', () => {
    everyVersion(c.f2.activityUnderThirtyMinutes, 'Under 30');
    everyVersion(c.f2.runTenKmOrMore, 'Run 6 miles (10 km) or more');
  });

  it('f3 and f4: cannot pay an emergency expense, in the high tier or with savings for 3 months or more', () => {
    everyVersion(c.f3.cannotPayEmergency, 'I could not pay for it right now');
    everyVersion(c.f4.cannotPayEmergency, 'I could not pay for it right now');
    expect(c.f3.tier).toBe('high');
    // The high tier is a value the first wealth question can write.
    expect(bank.items.W1.versions.some((v) => v.tier?.includes('high'))).toBe(true);
    const savings = bank.items.W3.versions.map((v) => [v.key, v.opts.slice(c.f4.savingsThreeMonthsOrMore.option).map((o) => o.en)]);
    expect(savings).toEqual([
      ['ret', ['10 to 20 years', 'More than 20 years']],
      ['sup', ['3 to 6 months', 'More than 6 months']],
      ['seek', ['3 to 6 months', 'More than 6 months']],
      ['base', ['3 to 6 months', 'More than 6 months']],
    ]);
  });

  it('f5: knows 8 to 10 kinds of people, and none of the four kinds of help', () => {
    everyVersion(c.f5.knowsEightToTenKinds, '8 to 10');
    everyVersion(c.f5.noHelpAvailable, 'None');
  });

  it('f6 and f7: the youngest age group is 18 to 20', () => {
    expect(bank.ages[c.youngestAge].en).toBe('18 to 20');
    const degrees = bank.items.C_deg.versions[0].opts.map((o) => o.en).slice(c.f6.mastersOrHigher.option);
    expect(degrees).toEqual(["Master's or professional degree (MBA, JD, MD)", 'Doctorate']);
    everyVersion(c.f7.executive, 'Executive, or founder with employees');
    // The top band of net worth, whichever version was shown.
    for (const v of bank.items.W4.versions) {
      expect(c.f7.topNetWorth.option, v.key).toBe(v.opts.length - 1);
      expect(v.opts[c.f7.topNetWorth.option].en, v.key).toMatch(/or more$/);
    }
    everyVersion(c.f7.teamOfHundredOrMore, '100 or more');
    expect(bank.items.C_team.versions.map((v) => v.key)).toContain(c.f7.ownerTeamVersion);
  });

  it('f8: life satisfaction of 9 to 10, and little interest nearly every day', () => {
    everyVersion(c.f8.satisfiedNineToTen, '9 to 10');
    everyVersion(c.f8.littleInterestNearlyEveryDay, 'Nearly every day');
    expect(bank.items.M4.versions[0].q.en).toMatch(/little interest/);
  });

  it('f12: under 2 years in the background, and the top self-rating', () => {
    for (const ref of c.f12.fewYears) {
      const asked = bank.roles.flatMap((role) => bank.extra[role.id].filter((q) => q.id === ref.id));
      expect(asked.length, ref.id).toBeGreaterThan(0);
      for (const question of asked) expect(question.opts[ref.option].en, ref.id).toBe('Under 2 years');
    }
    expect(texts(c.f12.knownInTheField)).toEqual([
      'Near the top, with results in competitions, research or a portfolio',
      'Known in the area: invited to present, review or collaborate',
      'Known in the field: invited to speak, judge or help set standards',
      'Known in the field: invited to speak, judge or help set standards',
    ]);
    for (const v of bank.items.C_mast.versions) expect(c.f12.knownInTheField.option).toBe(v.opts.length - 1);
  });

  it('the mind notice: "Nearly every day" on both mood questions', () => {
    expect(RULES.mindNotice.map((q) => q.id)).toEqual(['M3', 'M4']);
    for (const ref of RULES.mindNotice) everyVersion(ref, 'Nearly every day');
  });

  it('the ladder question has five options of two rungs each, and belongs to no sector', () => {
    const ladder = bank.items[RULES.ladderItem];
    expect(ladder.area).toBe('G');
    expect(ladder.versions[0].opts.map((o) => o.en)).toEqual(['Rungs 1 to 2', 'Rungs 3 to 4', 'Rungs 5 to 6', 'Rungs 7 to 8', 'Rungs 9 to 10']);
    expect(ALGO_PARAMS[1].social.rungs).toBe(10);
  });

  it('the interest question: one correct option, scored 1', () => {
    const { itemId, correctScore, area } = ALGO_PARAMS[1].interest;
    const interest = bank.items[itemId].versions[0];
    expect(bank.items[itemId].area).toBe(area);
    expect(interest.opts.map((o) => o.en)).toEqual(["Don't know", 'Less than $102', 'Exactly $102', 'More than $102']);
    expect(interest.s.map((s) => s === correctScore)).toEqual([false, false, false, true]);
  });

  it('the contrast groups sit in the sectors they compare', () => {
    const g = RULES.contrasts;
    for (const id of [...g.moneyFacts, ...g.moneyWorry]) expect(bank.items[id].area, id).toBe('W');
    for (const id of [...g.peopleFacts, ...g.peopleLonely]) expect(bank.items[id].area, id).toBe('N');
    for (const id of [...g.healthHabits, ...g.healthRated]) expect(bank.items[id].area, id).toBe('B');
    expect([...g.mindOthers, g.mind].sort()).toEqual(['B', 'C', 'M', 'N', 'W']);
  });
});

describe('check f10 as the reference has it', () => {
  // reference/test_page.html: `if (keepAll < 0.5) add("f10", 2); else if (keepAll < 0.7) add("f10", 1)`.
  // No answer counts below the floor of 0.5, so the mean is never under 0.5 and the 2 point
  // level cannot fire. Kept for parity (the reference decides the checks) and reported to the
  // team. This test states the fact, so that a decision to change it is made on purpose.
  it('the fastest possible session gets 1 point and keeps data grade A', () => {
    const { speeding } = ALGO_PARAMS[1].flags;
    expect(speeding).toEqual([
      { below: 0.5, points: 2 },
      { below: 0.7, points: 1 },
    ]);
    expect(speeding[0].below).toBe(ALGO_PARAMS[1].timing.multiplierFloor);
    const background = backgroundFor('emp');
    // Option 1 everywhere, tapped in the middle of the list, so no other check fires.
    const steps: Step[] = walk(background, () => 1, { secs: 0.01, lang: 'en' }).map((s) => ({ ...s, where: 'middle' }));
    const result = compute({ bank, background, steps });
    expect(result.keepAll).toBe(0.5);
    expect(result.flags.map((f) => `${f.id}:${f.points}`)).toEqual(['f10:1']);
    expect(result.grade).toBe('A');
    // Even a time of zero or below counts at the floor.
    for (const secs of [0, -3]) {
      const again = compute({ bank, background, steps: steps.map((s) => ({ ...s, secs })) });
      expect(again.keepAll).toBe(0.5);
      expect(again.flags).toEqual([{ id: 'f10', points: 1 }]);
    }
  });
});
