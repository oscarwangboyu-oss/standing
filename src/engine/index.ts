// Standing scoring engine: public API.
//
// Pure TypeScript shared by the browser, the server and later the phone app. It uses no DOM
// and no Node API. It never reads a clock and never draws a random number: the caller measures
// answer times and supplies the random number for the display order. Given the same input it
// always returns the same result.
//
// The engine returns data only. Every word a user reads lives in src/copy.

import { getAlgo, getBank } from './registry';
import type {
  AreaId,
  Background,
  Bank,
  Context,
  ItemVersion,
  Lang,
  Market,
  NextQuestion,
  OrderDirection,
  PreviousPrices,
  Progress,
  SelectionOptions,
  Step,
  TimingParams,
  Where,
} from './types';

// ---------------------------------------------------------------- selection

/** Routing attributes from the background answers. */
export function contextOf(bank: Bank, background: Background): Context {
  return getAlgo().contextOf(bank, background);
}

/**
 * The next question to show, or null when the questionnaire is finished. A pure function of
 * the stored steps, so a session resumes where it stopped. A skipped question is a step with
 * k = null.
 */
export function nextQuestion(
  bank: Bank,
  background: Background,
  steps: readonly Step[],
  opts?: SelectionOptions,
): NextQuestion | null {
  return getAlgo(opts?.algo).nextQuestion(bank, background, steps, opts);
}

/** Questions done, total and remaining, for the progress bar. */
export function progressOf(
  bank: Bank,
  background: Background,
  steps: readonly Step[],
  opts?: SelectionOptions,
): Progress {
  return getAlgo(opts?.algo).progressOf(bank, background, steps, opts);
}

// ---------------------------------------------------------------- display

/**
 * best_first (bank order reversed) or worst_first (bank order) for a random number in [0, 1).
 * Store it on the step as `order`. See OrderDirection for what the two names do and do not say.
 */
export function orderDirection(rngFloat: number): OrderDirection {
  return getAlgo().orderDirection(rngFloat);
}

/** Option indices in display order for the same random number. Pinned options stay last. */
export function displayOrder(version: ItemVersion, rngFloat: number): number[] {
  return getAlgo().displayOrder(version, rngFloat);
}

/**
 * Option indices in display order for a stored direction (Step.order). Use it to rebuild what
 * was on screen, for a resumed session or to verify a reported tap position.
 */
export function displayOrderFor(version: ItemVersion, direction: OrderDirection): number[] {
  return getAlgo().displayOrderFor(version, direction);
}

/** Whether option k sat first, last or in the middle of the displayed order. */
export function whereOf(k: number, order: readonly number[]): Where {
  return getAlgo().whereOf(k, order);
}

// ---------------------------------------------------------------- timing

/** Reading units of a stem: words in English, characters and Latin runs in Chinese. */
export function readUnits(text: string, lang: Lang): number {
  return getAlgo().readUnits(text, lang);
}

/** Seconds below which an answer counts at reduced weight. Use the language shown when answering. */
export function thresholdFor(text: string, lang: Lang, params?: TimingParams): number {
  return getAlgo().thresholdFor(text, lang, params);
}

/** Weight multiplier of an answer. secs = null means the answer was not timed and counts in full. */
export function multiplierFor(secs: number | null, threshold: number, params?: TimingParams): number {
  return getAlgo().multiplierFor(secs, threshold, params);
}

// ---------------------------------------------------------------- scoring

export { compute } from './score';

/**
 * Leader, laggard, tags and movers from sector prices alone. compute() already returns this as
 * result.market; use this when prices come from elsewhere, for example a daily series.
 */
export function marketOf(input: {
  prices: Partial<Record<AreaId, number | null>>;
  /** True while the mind notice is shown, whatever its origin. Pass Result.mindNotice, or the daily rule. */
  mindAlert: boolean;
  previous?: PreviousPrices | null;
  /** Sector order used to break ties. Defaults to the order of the current bank. */
  order?: readonly AreaId[];
  algo?: number;
}): Market {
  const order = input.order ?? getBank().order;
  return getAlgo(input.algo).marketOf(input.prices, order, input.mindAlert, input.previous);
}

// ---------------------------------------------------------------- registry, config, types

export { ALGOS, BANKS, CURRENT, NORMS, getAlgo, getBank, getNorm, registerAlgo } from './registry';
export { createAlgoV1 } from './algo/v1';
export { createTestVariantAlgo } from './algo/test-variant';
export { bandIndexFor, bandOptionAt, bandOptionFor, bandRangeOf } from './bands';
export type { BankBand } from './config';
export {
  ALGO_PARAMS,
  BANK_BANDS,
  BREAKDOWN,
  DASHBOARD_RED_LINES,
  EVALUATION,
  GO_CRITERIA,
  RECOMPUTE_MOVE_POINTS,
  RETEST_WINDOW_DAYS,
  RETURN_RATE_DAYS,
  TEST_VARIANT,
} from './config';

// ---------------------------------------------------------------- after the first check

export { addDays, dayNumber, dayOf, daysBetween, isDay, weekOf } from './days';
export { canLogDailyFor, dailyOpenInput, dailyStreak } from './live/daily';
export type { DailyOpenInput, DailyReading, Streak } from './live/daily';
export { PAY_FREQUENCIES, PAY_PERIODS_PER_YEAR, paydayBandsFor, paydayBaselineOf, paydayEligible } from './live/payday';
export type { PayFrequency, PaydayAmounts, PaydayBaseline, PaydayLocal, PaydaySetup } from './live/payday';
export { explainCheckDay, explainDays, timeline, timelineInputOn } from './timeline';
export type {
  PersonHistory,
  ScoringVersions,
  Timeline,
  TimelineCheck,
  TimelineInput,
  TimelineMarker,
  TimelineOptions,
  TimelinePoint,
  TimelineSector,
  TimelineStatus,
  VersionChange,
} from './timeline';
export { breakdown } from './breakdown';
export type { AnswerState, Breakdown, BreakdownLine, PriceBreakdown } from './breakdown';
export {
  SEVEN_TESTS,
  changedAnswers,
  fairnessTest,
  gamingTest,
  mean,
  median,
  pearson,
  quantile,
  rangeTest,
  ranks,
  responseTest,
  spearman,
  stabilityTest,
  standardDeviation,
  validityTest,
  versionEffectTest,
} from './evaluation';
export type {
  EvalAnswer,
  EvalPair,
  EvalRecord,
  EvalVersionPair,
  FairnessTest,
  GamingTest,
  GroupMedian,
  RangeTest,
  ResponseTest,
  StabilityTest,
  ValidityTest,
  Verdict,
  VersionEffectTest,
} from './evaluation';
export { parseBank } from './bank';
export {
  AREA_IDS,
  CERTIFICATE_LEVELS,
  EngineError,
  FIELD_IDS,
  MONEY_IDS,
  NUDGE_CATEGORIES,
  ROLE_IDS,
  SECTION_IDS,
  SKIP_REASONS,
  SOURCES,
  TIER_IDS,
  WEEKLY_WIN_KINDS,
} from './types';
export type {
  Algo,
  AltSlot,
  AreaId,
  Background,
  Bank,
  BankItem,
  BankTiming,
  Bilingual,
  CertificateLevel,
  CompSlot,
  ComputeInput,
  Context,
  ContextKey,
  ContextValue,
  ContrastId,
  DailyEntry,
  Extra,
  ExtraDetail,
  ExtraQuestion,
  FieldId,
  Flag,
  FlagId,
  Grade,
  ItemVersion,
  Lang,
  LiveParams,
  Loads,
  Market,
  MarketChange,
  MarketChangeKind,
  MoneyId,
  NextQuestion,
  NormSet,
  NudgeCategory,
  OrderDirection,
  Override,
  PaydayBands,
  PeopleNudgeEntry,
  PeopleNudgeParams,
  PreviousPrices,
  Progress,
  Result,
  RoleId,
  SectionId,
  SectorMove,
  SectorNorm,
  SectorResult,
  SectorStatus,
  SectorTag,
  SelectionOptions,
  SkipReason,
  SkipSlot,
  SocialPosition,
  Source,
  Step,
  StepDetail,
  TierId,
  TimingParams,
  VersionSet,
  WeeklyWinEntry,
  WeeklyWinKind,
  WeeklyWinParams,
  Where,
} from './types';
export type { AlgoParamsV1, DailyOpenParams, PaydayParams } from './algo/v1';
