// Weekly Win (capability) and People Nudge (network): which questionnaire answers a log can
// replace, the extra items, the weeks they need, and that no free text reaches the engine.

import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, EngineError, addDays, compute, timeline, timelineInputOn } from '../../../src/engine';
import type { Extra, NudgeCategory, Override, PeopleNudgeEntry, PersonHistory, Step, WeeklyWinEntry } from '../../../src/engine';
import { backgroundFor, bank, walk, withAnswer } from './helpers';

// 2026-03-02 is a Monday: week n starts on day(7 * n).
const D = '2026-03-02';
const day = (n: number): string => addDays(D, n);
const emp = backgroundFor('emp');
const middle = walk(emp, () => 2);
const WIN = ALGO_PARAMS[1].weeklyWin;
const NUDGE = ALGO_PARAMS[1].peopleNudge;
const texts = (id: string, key: string): string[] => bank.items[id].versions.find((v) => v.key === key)!.opts.map((o) => o.en);

const history = (steps: Step[], more: Partial<PersonHistory>, background = emp): PersonHistory => ({
  checks: [{ day: D, background, steps }],
  ...more,
});
const overridesOn = (h: PersonHistory, n: number, itemId: string): Override[] =>
  (timelineInputOn(h, day(n))?.overrides ?? []).filter((o) => o.itemId === itemId);
const extraOn = (h: PersonHistory, n: number, id: string): Extra | undefined =>
  (timelineInputOn(h, day(n))?.extras ?? []).find((e) => e.id === id);

const course = (week: number, hours: number): WeeklyWinEntry => ({ day: day(7 * week + 2), kind: 'course', hours });
const skill = (week: number): WeeklyWinEntry => ({ day: day(7 * week + 2), kind: 'skill' });
const certificate = (n: number, level: 'entry' | 'advanced' = 'entry', exam = true): WeeklyWinEntry => ({ day: day(n), kind: 'certificate', exam, level });
const nudge = (week: number, reached: NudgeCategory[]): PeopleNudgeEntry => ({ day: day(7 * week + 4), planned: 3, reached });

describe('the questions the weekly rules read are the ones in bank 2.1', () => {
  it('C_learn, C_lic and N5 have the options the parameters stand for', () => {
    for (const key of ['ret', 'stu', 'plain', 'base']) {
      expect(texts('C_learn', key)).toEqual(['None', 'Under 10', '10 to 39', '40 to 99', '100 or more']);
    }
    for (const version of bank.items.C_lic.versions) {
      expect(version.opts.map((o) => o.en)).toEqual(['None', 'One at entry level', 'One advanced or state licence', 'Two', 'Three or more']);
    }
    expect(WIN.licence).toEqual({ itemId: 'C_lic', heldForOption: [0, 1, 1, 2, 3], oneEntryOption: 1, oneAdvancedOption: 2, optionFromTwo: [3, 4] });
    expect(texts('N5', 'base')).toEqual([
      'No, never',
      'Not now, but in the past',
      'Yes, we talk a few times a year',
      'Yes, we talk at least monthly',
      'Yes, more than one',
    ]);
    expect(NUDGE.mentor.levels.map((l) => l.option)).toEqual([3, 2]);
    expect([WIN.haltAfterDays, NUDGE.haltAfterDays, NUDGE.maxPerWeek]).toEqual([28, 28, 3]);
  });
});

describe('weekly win: course hours and the learning question', () => {
  it('replace the answer once courses were logged in 4 weeks and the hours reach a higher band', () => {
    expect(WIN.learning).toMatchObject({ midpointHours: [1, 3, 7, 15, 25], windowDays: 365, minWeeks: 4 });
    // The check said "10 to 39" hours. Three weeks of 10 to 19 hours: 45 hours, and too few weeks.
    const three = history(middle, { weeklyWins: [0, 1, 2].map((w) => course(w, 3)) });
    expect(overridesOn(three, 20, 'C_learn')).toEqual([]);
    // Four weeks: 60 hours, "40 to 99".
    const four = history(middle, { weeklyWins: [0, 1, 2, 3].map((w) => course(w, 3)) });
    expect(overridesOn(four, 22, 'C_learn')).toEqual([]);
    expect(overridesOn(four, 23, 'C_learn')).toEqual([{ itemId: 'C_learn', k: 3, source: 'weekly_win' }]);
    // Seven weeks: 105 hours, "100 or more".
    const seven = history(middle, { weeklyWins: [0, 1, 2, 3, 4, 5, 6].map((w) => course(w, 3)) });
    expect(overridesOn(seven, 44, 'C_learn')).toEqual([{ itemId: 'C_learn', k: 4, source: 'weekly_win' }]);
  });

  it('never lower the answer: the log covers only the weeks since logging began', () => {
    // Four weeks of about 1 hour: 4 hours, "Under 10", below the "10 to 39" of the check.
    const little = [0, 1, 2, 3].map((w) => course(w, 0));
    expect(overridesOn(history(middle, { weeklyWins: little }), 23, 'C_learn')).toEqual([]);
    // When the question was skipped, the log is all there is.
    const skipped = history(withAnswer(middle, 'C_learn', null), { weeklyWins: little });
    expect(overridesOn(skipped, 23, 'C_learn')).toEqual([{ itemId: 'C_learn', k: 1, source: 'weekly_win' }]);
  });

  it('one entry a week counts: the last one of the week', () => {
    const wins = [0, 1, 2, 3].map((w) => course(w, 3));
    // Later in week 3 the person logs a skill: that is week 3's entry, and it holds no hours.
    const replaced = history(middle, { weeklyWins: [...wins, { day: day(7 * 3 + 5), kind: 'skill' }] });
    expect(overridesOn(replaced, 23, 'C_learn')).toHaveLength(1);
    expect(overridesOn(replaced, 26, 'C_learn')).toEqual([]);
  });

  it('looks back 365 days', () => {
    const four = history(middle, { weeklyWins: [0, 1, 2, 3].map((w) => course(w, 3)) });
    // The first entry is on day 2. On day 366 it is 364 days old, on day 367 it is 365.
    expect(overridesOn(four, 366, 'C_learn')).toHaveLength(1);
    expect(overridesOn(four, 367, 'C_learn')).toEqual([]);
  });
});

describe('weekly win: a new licence or certificate and the licence question', () => {
  const none = withAnswer(middle, 'C_lic', 0);

  it('one with an exam, logged after the check, is one more than was answered', () => {
    expect(overridesOn(history(none, { weeklyWins: [certificate(7, 'entry')] }), 7, 'C_lic')).toEqual([{ itemId: 'C_lic', k: 1, source: 'weekly_win' }]);
    expect(overridesOn(history(none, { weeklyWins: [certificate(7, 'advanced')] }), 7, 'C_lic')).toEqual([{ itemId: 'C_lic', k: 2, source: 'weekly_win' }]);
    expect(overridesOn(history(none, { weeklyWins: [certificate(7), certificate(14)] }), 14, 'C_lic')[0].k).toBe(3);
    expect(overridesOn(history(none, { weeklyWins: [certificate(7), certificate(14), certificate(21)] }), 21, 'C_lic')[0].k).toBe(4);
    expect(overridesOn(history(none, { weeklyWins: [certificate(7), certificate(14), certificate(21), certificate(28)] }), 28, 'C_lic')[0].k).toBe(4);
    // Added to what the check said: one advanced licence plus one is "Two", two plus one "Three or more".
    expect(overridesOn(history(middle, { weeklyWins: [certificate(7)] }), 7, 'C_lic')[0].k).toBe(3);
    expect(overridesOn(history(withAnswer(middle, 'C_lic', 3), { weeklyWins: [certificate(7)] }), 7, 'C_lic')[0].k).toBe(4);
    expect(overridesOn(history(withAnswer(middle, 'C_lic', 4), { weeklyWins: [certificate(7)] }), 7, 'C_lic')).toEqual([]);
    expect(overridesOn(history(withAnswer(middle, 'C_lic', null), { weeklyWins: [certificate(7)] }), 7, 'C_lic')[0].k).toBe(1);
  });

  it('a certificate without an exam, or one from before the check, does not count', () => {
    expect(overridesOn(history(none, { weeklyWins: [certificate(7, 'entry', false)] }), 7, 'C_lic')).toEqual([]);
    expect(overridesOn(history(none, { weeklyWins: [certificate(0)] }), 7, 'C_lic')).toEqual([]);
    expect(overridesOn(history(none, { weeklyWins: [certificate(-7)] }), 7, 'C_lic')).toEqual([]);
    // A later full check asks the question again.
    const retaken: PersonHistory = {
      checks: [
        { day: D, background: emp, steps: none },
        { day: day(30), background: emp, steps: withAnswer(middle, 'C_lic', 1) },
      ],
      weeklyWins: [certificate(7)],
    };
    expect(overridesOn(retaken, 29, 'C_lic')).toHaveLength(1);
    expect(overridesOn(retaken, 30, 'C_lic')).toEqual([]);
  });

  it('a role that is not asked the licence question gets no override', () => {
    const owner = backgroundFor('owner');
    const steps = walk(owner, () => 2);
    expect(steps.some((s) => s.id === 'C_lic')).toBe(false);
    expect(overridesOn(history(steps, { weeklyWins: [certificate(7)] }, owner), 7, 'C_lic')).toEqual([]);
  });
});

describe('weekly win: regularity as an extra item in capability', () => {
  it('the share of the last 8 weeks with a win, once 4 of them have one', () => {
    expect(WIN.regularity).toEqual({ extraId: 'weekly_win', area: 'C', load: 0.5, windowWeeks: 8, minWeeks: 4 });
    const three = history(middle, { weeklyWins: [0, 1, 2].map(skill) });
    expect(extraOn(three, 20, 'weekly_win')).toBeUndefined();
    const four = history(middle, { weeklyWins: [0, 1, 2, 3].map(skill) });
    expect(extraOn(four, 22, 'weekly_win')).toBeUndefined();
    expect(extraOn(four, 23, 'weekly_win')).toEqual({ id: 'weekly_win', area: 'C', load: { C: 0.5 }, score: 0.5, source: 'weekly_win' });
    const eight = history(middle, { weeklyWins: [0, 1, 2, 3, 4, 5, 6, 7].map(skill) });
    expect(extraOn(eight, 51, 'weekly_win')?.score).toBe(1);
  });

  it('a new week does not count against the person before they log, and a week without a win does', () => {
    const eight = history(middle, { weeklyWins: [0, 1, 2, 3, 4, 5, 6, 7].map(skill) });
    // Week 8 has no entry yet: the eight weeks before it are read.
    expect(extraOn(eight, 56, 'weekly_win')?.score).toBe(1);
    expect(extraOn(eight, 62, 'weekly_win')?.score).toBe(1);
    // Week 9: week 8 went by without a win.
    expect(extraOn(eight, 63, 'weekly_win')?.score).toBe(7 / 8);
    expect(extraOn(eight, 63 + 21, 'weekly_win')?.score).toBe(4 / 8);
    expect(extraOn(eight, 63 + 28, 'weekly_win')).toBeUndefined();
  });

  it('every kind of win counts, it is one more own item of capability, and it moves no other sector', () => {
    const mixed: WeeklyWinEntry[] = [0, 1, 2, 3, 4, 5, 6, 7].map((w) => (w % 2 ? skill(w) : course(w, 0)));
    const input = timelineInputOn(history(middle, { weeklyWins: mixed }), day(51))!;
    expect(input.extras).toEqual([{ id: 'weekly_win', area: 'C', load: { C: 0.5 }, score: 1, source: 'weekly_win' }]);
    const base = compute({ bank, background: emp, steps: middle });
    const result = compute(input);
    expect(result.sectors.C.ownItems).toBe(base.sectors.C.ownItems + 1);
    const rise = (result.sectors.C.price as number) - (base.sectors.C.price as number);
    // Half a question: a modest move.
    expect(rise).toBeGreaterThan(0.5);
    expect(rise).toBeLessThan(3);
    for (const a of ['W', 'N', 'B', 'M'] as const) expect(result.sectors[a]).toEqual(base.sectors[a]);
  });

  it('refuses an entry of an unknown kind or with an hours option that does not exist', () => {
    const bad = (entry: unknown): PersonHistory => history(middle, { weeklyWins: [entry as WeeklyWinEntry] });
    expect(() => timelineInputOn(bad({ day: day(1), kind: 'party' }), day(2))).toThrow(EngineError);
    expect(() => timelineInputOn(bad({ day: day(1), kind: 'course', hours: 5 }), day(2))).toThrow(EngineError);
    expect(() => timelineInputOn(bad({ day: day(1), kind: 'certificate', exam: true, level: 'top' }), day(2))).toThrow(EngineError);
  });
});

describe('people nudge: people reached as an extra item in network', () => {
  const friends: NudgeCategory[] = ['friend', 'family', 'work'];

  it('people reached out of three, averaged over the last 8 weeks, once 4 of them have a log', () => {
    expect(NUDGE.reach).toEqual({ extraId: 'people_reached', area: 'N', load: 0.5, windowWeeks: 8, minWeeks: 4 });
    const three = history(middle, { peopleNudges: [0, 1, 2].map((w) => nudge(w, friends)) });
    expect(extraOn(three, 20, 'people_reached')).toBeUndefined();
    const four = history(middle, { peopleNudges: [0, 1, 2, 3].map((w) => nudge(w, friends)) });
    expect(extraOn(four, 25, 'people_reached')).toEqual({ id: 'people_reached', area: 'N', load: { N: 0.5 }, score: 0.5, source: 'people_nudge' });
    const eight = history(middle, { peopleNudges: [0, 1, 2, 3, 4, 5, 6, 7].map((w) => nudge(w, friends)) });
    expect(extraOn(eight, 53, 'people_reached')?.score).toBe(1);
    // One person reached in each of 8 weeks: a third.
    const one = history(middle, { peopleNudges: [0, 1, 2, 3, 4, 5, 6, 7].map((w) => nudge(w, ['friend'])) });
    expect(extraOn(one, 53, 'people_reached')?.score).toBeCloseTo(1 / 3, 12);
  });

  it('more than three in a week count as three, and a week in which nobody was reached is a log of zero', () => {
    const many: NudgeCategory[] = ['friend', 'friend', 'family', 'work', 'other'];
    const eight = history(middle, { peopleNudges: [0, 1, 2, 3, 4, 5, 6, 7].map((w) => nudge(w, many)) });
    expect(extraOn(eight, 53, 'people_reached')?.score).toBe(1);
    const nobody = history(middle, { peopleNudges: [0, 1, 2, 3].map((w) => nudge(w, [])) });
    expect(extraOn(nobody, 25, 'people_reached')?.score).toBe(0);
    const base = compute({ bank, background: emp, steps: middle });
    const lower = compute(timelineInputOn(nobody, day(25))!);
    expect(lower.sectors.N.price as number).toBeLessThan(base.sectors.N.price as number);
    expect(lower.sectors.N.ownItems).toBe(base.sectors.N.ownItems + 1);
  });

  it('refuses a category that does not exist', () => {
    const bad = history(middle, { peopleNudges: [{ day: day(1), planned: 3, reached: ['boss' as NudgeCategory] }] });
    expect(() => timelineInputOn(bad, day(2))).toThrow(EngineError);
  });
});

describe('people nudge: contact with a mentor and the mentor question', () => {
  const withMentor: NudgeCategory[] = ['mentor', 'friend'];

  it('a mentor reached in 3 weeks of the last 91 days reads as "at least monthly"', () => {
    // The check said "a few times a year".
    const two = history(middle, { peopleNudges: [0, 1].map((w) => nudge(w, withMentor)) });
    expect(overridesOn(two, 11, 'N5')).toEqual([]);
    const three = history(middle, { peopleNudges: [0, 1, 2].map((w) => nudge(w, withMentor)) });
    expect(overridesOn(three, 17, 'N5')).toEqual([]);
    expect(overridesOn(three, 18, 'N5')).toEqual([{ itemId: 'N5', k: 3, source: 'people_nudge' }]);
    // 91 days after the first of the three, only two are left inside the 91 days.
    expect(overridesOn(three, 4 + 90, 'N5')).toHaveLength(1);
    expect(overridesOn(three, 4 + 91, 'N5')).toEqual([]);
  });

  it('in 2 weeks of the last 365 days as "a few times a year", and it never lowers the answer', () => {
    const never = withAnswer(middle, 'N5', 0);
    const two = [0, 1].map((w) => nudge(w, withMentor));
    expect(overridesOn(history(never, { peopleNudges: [two[0]] }), 4, 'N5')).toEqual([]);
    expect(overridesOn(history(never, { peopleNudges: two }), 11, 'N5')).toEqual([{ itemId: 'N5', k: 2, source: 'people_nudge' }]);
    // Three contacts far apart: not monthly, and still a few times a year.
    const spread = history(never, { peopleNudges: [0, 7, 14].map((w) => nudge(w, withMentor)) });
    expect(overridesOn(spread, 7 * 14 + 4, 'N5')).toEqual([{ itemId: 'N5', k: 2, source: 'people_nudge' }]);
    // "Yes, more than one" stays.
    const several = history(withAnswer(middle, 'N5', 4), { peopleNudges: [0, 1, 2].map((w) => nudge(w, withMentor)) });
    expect(overridesOn(several, 18, 'N5')).toEqual([]);
    // Weeks without a mentor among the people reached do not count.
    const friendsOnly = history(never, { peopleNudges: [0, 1, 2].map((w) => nudge(w, ['friend', 'work'])) });
    expect(overridesOn(friendsOnly, 18, 'N5')).toEqual([]);
  });

  it('applies only to the wording that asks about a mentor', () => {
    const retired = backgroundFor('ret');
    const steps = walk(retired, () => 0);
    expect(steps.find((s) => s.id === 'N5')?.key).toBe('ret');
    const h = history(steps, { peopleNudges: [0, 1, 2].map((w) => nudge(w, withMentor)) }, retired);
    expect(overridesOn(h, 18, 'N5')).toEqual([]);
  });
});

describe('free text stays on the device', () => {
  it('the entry types have no text field, and a stray one never reaches compute or the series', () => {
    const wins = [0, 1, 2, 3].map((w) => ({ ...course(w, 3), title: 'Organic chemistry, part two' })) as WeeklyWinEntry[];
    const nudges = [0, 1, 2, 3].map((w) => ({ ...nudge(w, ['mentor']), names: ['Priya Raman'] })) as PeopleNudgeEntry[];
    const h = history(middle, { weeklyWins: wins, peopleNudges: nudges });
    const input = timelineInputOn(h, day(27))!;
    expect((input.overrides ?? []).map((o) => o.itemId).sort()).toEqual(['C_learn', 'N5']);
    expect((input.extras ?? []).map((e) => e.id).sort()).toEqual(['people_reached', 'weekly_win']);
    const sent = JSON.stringify([input.overrides, input.extras, timeline({ ...h, until: day(27) })]);
    expect(sent).not.toMatch(/chemistry|Priya/);
  });
});
