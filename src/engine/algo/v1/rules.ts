// The questions and options of bank 2.x that the rules of algorithm version 1 read by name.
//
// These are identifications, not tunable values: an option index stands for one option text
// ("Very good", "Under 30", "8 to 10"). The numbers a rule compares against (points, shares,
// thresholds) live in config.ts. tests/unit/engine/rules.test.ts pins every index below to
// the option text of bank 2.1, so a bank edit that reorders options fails a test instead of
// silently changing a rule. A bank version that moves one of these options needs a new
// algorithm version with its own copy of this file.

import { deepFreeze } from '../../freeze';
import type { AreaId } from '../../types';

/** One option of one question. */
export interface OptionRef {
  id: string;
  option: number;
}

export const RULES = deepFreeze({
  /** The closing ladder question: social position and contrast c1. */
  ladderItem: 'G1',

  /** The mind notice: "Nearly every day" on both mood questions. */
  mindNotice: [
    { id: 'M3', option: 0 },
    { id: 'M4', option: 0 },
  ] as OptionRef[],

  contrasts: {
    /** c2: money circumstances against worry about money. */
    moneyFacts: ['W1', 'W2', 'W3', 'W4', 'W5'],
    moneyWorry: ['W6'],
    /** c3: breadth of contacts against loneliness. */
    peopleFacts: ['N1', 'N2', 'N3', 'N4', 'N5'],
    peopleLonely: ['N6'],
    /** c4: exercise, sleep and fitness against rated health and days limited. */
    healthHabits: ['B2', 'B3', 'B4'],
    healthRated: ['B1', 'B5'],
    /** c6: the other four sectors against mind. */
    mindOthers: ['B', 'W', 'N', 'C'] as AreaId[],
    mind: 'M' as AreaId,
  },

  checks: {
    /** Index of the age group "18 to 20", read by f6 and f7. */
    youngestAge: 0,
    f1: {
      /** B1 "Very good" or the option after it, "Excellent". */
      healthVeryGoodOrBetter: { id: 'B1', option: 3 },
      /** B5 "15 or more" days limited in the past 30. */
      limitedFifteenDaysOrMore: { id: 'B5', option: 0 },
    },
    f2: {
      /** B2 "Under 30" minutes of activity a week. */
      activityUnderThirtyMinutes: { id: 'B2', option: 0 },
      /** B4 "Run 6 miles (10 km) or more". */
      runTenKmOrMore: { id: 'B4', option: 5 },
    },
    f3: {
      /** Income tier written by the first wealth question. */
      tier: 'high',
      /** W2 "I could not pay for it right now". */
      cannotPayEmergency: { id: 'W2', option: 0 },
    },
    f4: {
      cannotPayEmergency: { id: 'W2', option: 0 },
      /** W3 "3 to 6 months" or longer ("10 to 20 years" or longer in the version for retirees). */
      savingsThreeMonthsOrMore: { id: 'W3', option: 3 },
    },
    f5: {
      /** N1 "8 to 10" kinds of people known. */
      knowsEightToTenKinds: { id: 'N1', option: 4 },
      /** N3 "None" of the four kinds of help. */
      noHelpAvailable: { id: 'N3', option: 0 },
    },
    f6: {
      /** C_deg "Master's or professional degree" or the option after it, "Doctorate". */
      mastersOrHigher: { id: 'C_deg', option: 4 },
    },
    f7: {
      /** C_lvl "Executive, or founder with employees". */
      executive: { id: 'C_lvl', option: 4 },
      /** W4, the top net-worth band of whichever version was shown. */
      topNetWorth: { id: 'W4', option: 5 },
      /** C_team in the version for owners, "100 or more" people. */
      ownerTeamVersion: 'owner',
      teamOfHundredOrMore: { id: 'C_team', option: 4 },
    },
    f8: {
      /** M1 life satisfaction "9 to 10". */
      satisfiedNineToTen: { id: 'M1', option: 4 },
      /** M4 little interest "Nearly every day". */
      littleInterestNearlyEveryDay: { id: 'M4', option: 0 },
    },
    f12: {
      /** Background answers that mean under 2 years: `stage` "Under 2 years", `exp` "Under 2 years". */
      fewYears: [
        { id: 'stage', option: 0 },
        { id: 'exp', option: 1 },
      ] as OptionRef[],
      /** C_mast "Known in the field" (or its counterpart in the other versions). */
      knownInTheField: { id: 'C_mast', option: 4 },
    },
  },
} as const);
