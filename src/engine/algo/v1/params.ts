// Shape of the parameters of algorithm version 1. The values live in src/engine/config.ts.

import type { AreaId, FlagId, TierId, TimingParams } from '../../types';

export interface DailyOpenParams {
  /** Look-back window in days. */
  windowDays: number;
  /** Days with a record needed inside the window before daily data replaces the questionnaire answer. */
  minDays: number;
  sleep: {
    /** Question whose answer the daily sleep records replace. */
    itemId: string;
    /** Hours assumed for each daily sleep option. */
    midpointHours: number[];
  };
  exercise: {
    /** Question whose answer the daily exercise records replace. */
    itemId: string;
    /** Minutes assumed for each daily exercise option. */
    midpointMinutes: number[];
    /** The daily mean is multiplied by this to compare with the weekly question. */
    daysPerWeek: number;
  };
  state: {
    /** Id of the synthetic item added to the mind sector. */
    extraId: string;
    area: AreaId;
    load: number;
    /** Score of each of the five state options, from very bad to very good. */
    scores: number[];
  };
  /** Days without a record after which body and mind are halted. */
  haltAfterDays: number;
  /** Days after the last full check at which a quarterly retest is suggested. */
  retestAfterDays: number;
  streak: {
    /** How many days back a missed day can still be filled in. */
    backfillDays: number;
    /** Missed days in a row that reset the streak. */
    resetAfterMissedDays: number;
  };
  mindNotice: {
    windowDays: number;
    /** Days of "very bad" inside the window that show the mind notice. */
    veryBadDays: number;
  };
}

export interface PaydayParams {
  /** Pay periods averaged for the saving and debt shares. */
  averagePeriods: number;
  /** Days without a payday check after which the wealth sector is halted. */
  haltAfterDays: number;
  /** What the saving and debt amounts are divided by. */
  denominator: 'take_home';
  /** Question replaced by cash on hand divided by essential monthly spending. */
  runwayItemId: string;
  /** Question replaced by the saving share (high tier) or the debt share (everyone else). */
  shareItemId: string;
}

export interface AlgoParamsV1 {
  timing: TimingParams;
  sector: {
    /** Weight of the sector's own questions in its value. */
    ownShare: number;
    /** Weight of questions from other sectors that load on it. */
    otherShare: number;
    /** A sector gets a price only when at least this share of its own questions has a score. */
    minOwnScoredShare: number;
  };
  overall: {
    /** Fewest priced sectors for an overall price. */
    minPricedSectors: number;
  };
  price: {
    /** Price of the group median. */
    issue: number;
    /** Price points for one standard deviation. */
    pointsPerSd: number;
    /** Limit down. */
    min: number;
    /** Limit up. */
    max: number;
  };
  interest: {
    /** The question that carries the correction. */
    itemId: string;
    /** The sector the correction moves. */
    area: AreaId;
    /** Score that counts as answered correctly. */
    correctScore: number;
    /** Share of the distance to the median the sector is moved when the answer is wrong. */
    shrink: number;
  };
  skipDefaults: {
    /** Tier used when the routing question is skipped. */
    tier: TierId;
    /** Tier used instead when day-to-day money is support from others. */
    tierWhenMoneyIsSup: TierId;
    /** Manager route when the job-level question is skipped. */
    mgr: 0 | 1;
  };
  display: {
    /** The injected random number selects best-first when it is below this. */
    bestFirstBelow: number;
  };
  flags: {
    /** Points of each consistency check. f10 has two levels and is listed under speeding. */
    points: Record<Exclude<FlagId, 'f10'>, number>;
    /**
     * f10: mean time multiplier below `below` gives `points`. First match wins. The mean runs
     * over every question on the path; a question without an answer counts as 1.
     */
    speeding: Array<{ below: number; points: number }>;
    /**
     * f11: the check fires when more than this share of the questions on the path were
     * answered on the first display position, or on the last.
     */
    samePositionShare: number;
    /** Flag points from which the data grade is B. */
    gradeB: number;
    /** Flag points from which the data grade is C. */
    gradeC: number;
  };
  contrasts: {
    /** c1: objective value (0 to 1) against the ladder (0 to 1). */
    ladder: number;
    /** c2: money circumstances against worry about money. */
    money: number;
    /** c3: breadth of contacts against loneliness. */
    people: number;
    /** c4: exercise and sleep against rated health. */
    health: number;
    /** c6: mean price of the other four sectors against the mind price, in price points. */
    mindPoints: number;
  };
  social: {
    /** Rungs of the ladder. */
    rungs: number;
    /** Gap in rungs from which own placement counts as well below or well above circumstances. */
    markedGap: number;
  };
  market: {
    /** Sectors less than this many points apart are called level: no leader, laggard or type. */
    flatBand: number;
    /** Order of the sectors on the result page. Ties between movers resolve in this order. */
    showOrder: AreaId[];
    /** A sector whose price changed by this much or less since the previous record counts as unchanged. */
    unchangedBand: number;
    /** Fewest sectors priced in both records for the result to name movers. */
    minMovers: number;
  };
  /** Most points a sector may move in one day from daily or payday data. A full retest is exempt. */
  dailyMoveLimitPoints: number;
  dailyOpen: DailyOpenParams;
  payday: PaydayParams;
}
