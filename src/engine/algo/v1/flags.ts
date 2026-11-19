// Consistency checks f1 to f12 and the data grade, as in `flags` of reference/test_page.html.
//
// The checks grade the questionnaire answers as they were given. They never look at overrides
// or extras. Which question and option each check reads is named in rules.ts.
//
// The reference has no skip and no unfinished session, so three checks are extended here.
// On a finished session without a skip they give exactly what the reference gives.
// - A check that reads a skipped question does not fire.
// - Replacing an answer with a skip can never add a check. f10 and f11 therefore run over
//   every question on the path, not only the answered ones: a question without an answer
//   (skipped, or not reached yet) counts at full weight in f10 and as tapped on neither end
//   in f11.
// - f9 needs an answer to every question on the path.

import type { Flag, FlagId, Grade, TierId, Where } from '../../types';
import type { AlgoParamsV1 } from './params';
import { RULES } from './rules';
import type { OptionRef } from './rules';

export interface FlagFacts {
  /** Index of the age group. */
  age: number;
  /** Under 2 years in the field (employees, freelancers, owners) or of work experience (job seekers). */
  fewYears: boolean;
  tier: TierId | null;
  /** Option answered in the questionnaire, or null when skipped or not asked. */
  k: (id: string) => number | null;
  /** Version key shown, or null when not asked. */
  keyOf: (id: string) => string | null;
  /**
   * One entry per answered question: its score, the best score of its version, where it was
   * tapped, and its time multiplier.
   */
  answered: ReadonlyArray<{ score: number | null; best: number; where?: Where; timeMultiplier: number }>;
  /** Questions on the path of this person: answered, skipped and not reached yet. */
  asked: number;
}

export interface FlagResult {
  flags: Flag[];
  flagPoints: number;
  grade: Grade;
}

export function flagsOf(params: AlgoParamsV1, facts: FlagFacts): FlagResult {
  const { points, speeding, samePositionShare, gradeB, gradeC } = params.flags;
  const { k, answered, asked } = facts;
  const c = RULES.checks;
  const flags: Flag[] = [];
  const add = (id: Exclude<FlagId, 'f10'>): void => {
    flags.push({ id, points: points[id] });
  };
  /** The option was chosen. False for a skipped question. */
  const is = (ref: OptionRef): boolean => k(ref.id) === ref.option;
  /** The option or one after it was chosen. False for a skipped question. */
  const atLeast = (ref: OptionRef): boolean => {
    const value = k(ref.id);
    return value !== null && value >= ref.option;
  };
  const youngest = facts.age === c.youngestAge;

  // f1: health rated very good or excellent, and 15 or more days limited in the past 30.
  if (atLeast(c.f1.healthVeryGoodOrBetter) && is(c.f1.limitedFifteenDaysOrMore)) add('f1');
  // f2: under 30 minutes of activity a week, and able to run 10 km or more.
  if (is(c.f2.activityUnderThirtyMinutes) && is(c.f2.runTenKmOrMore)) add('f2');
  // f3: income in the high tier, and no way at all to pay an emergency expense.
  if (facts.tier === c.f3.tier && is(c.f3.cannotPayEmergency)) add('f3');
  // f4: unable to pay an emergency expense, and savings for more than 3 months.
  if (is(c.f4.cannotPayEmergency) && atLeast(c.f4.savingsThreeMonthsOrMore)) add('f4');
  // f5: knows 8 to 10 kinds of people, and none of the four kinds of help available.
  if (is(c.f5.knowsEightToTenKinds) && is(c.f5.noHelpAvailable)) add('f5');
  // f6: aged 18 to 20, and holding a master's degree or higher.
  if (youngest && atLeast(c.f6.mastersOrHigher)) add('f6');
  // f7: aged 18 to 20, and an executive with top net worth, or the owner of a company of 100 or more.
  const executive = is(c.f7.executive) && is(c.f7.topNetWorth);
  const bigOwner = facts.keyOf(c.f7.teamOfHundredOrMore.id) === c.f7.ownerTeamVersion && is(c.f7.teamOfHundredOrMore);
  if (youngest && (executive || bigOwner)) add('f7');
  // f8: life satisfaction of 9 to 10, and little interest nearly every day.
  if (is(c.f8.satisfiedNineToTen) && is(c.f8.littleInterestNearlyEveryDay)) add('f8');
  // f9: the best option on every question of the path. One skipped or unreached question rules it out.
  if (asked > 0 && answered.length === asked && answered.every((a) => a.score === a.best)) add('f9');
  // f10: many answers came faster than the stem could be read.
  const speed = speeding.find((level) => speedKeep(facts) < level.below);
  if (speed) flags.push({ id: 'f10', points: speed.points });
  // f11: nearly every question answered on the same display position, always the first or always the last.
  const share = (where: Where): number => (asked === 0 ? 0 : answered.filter((a) => a.where === where).length / asked);
  if (share('first') > samePositionShare || share('last') > samePositionShare) add('f11');
  // f12: under 2 years in the field, and self-rated as known in the field.
  if (facts.fewYears && is(c.f12.knownInTheField)) add('f12');

  const flagPoints = flags.reduce((sum, f) => sum + f.points, 0);
  const grade: Grade = flagPoints >= gradeC ? 'C' : flagPoints >= gradeB ? 'B' : 'A';
  return { flags, flagPoints, grade };
}

/**
 * The mean time multiplier check f10 reads: over every question on the path, with a question
 * that has no answer counted as 1. On a finished session without a skip it equals keepAll.
 */
export function speedKeep(facts: Pick<FlagFacts, 'answered' | 'asked'>): number {
  if (facts.asked === 0) return 1;
  const unanswered = facts.asked - facts.answered.length;
  return (facts.answered.reduce((sum, a) => sum + a.timeMultiplier, 0) + unanswered) / facts.asked;
}

/** Best score of a version: the highest score among its scored options. */
export function bestScore(scores: ReadonlyArray<number | null>): number {
  return Math.max(...scores.map((s) => (s === null ? -1 : s)));
}
