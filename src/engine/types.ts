// Types shared by every algorithm version, the browser, the server and later the phone app.
// Nothing in src/engine may touch the DOM, Node, the clock or ambient randomness.

// ---------------------------------------------------------------- identifiers

/** The five sectors. C capability, W wealth, N network, B body, M mind. */
export type AreaId = 'C' | 'W' | 'N' | 'B' | 'M';

/** Section a question is shown under. "G" is the closing ladder question, which belongs to no sector. */
export type SectionId = AreaId | 'G';

export type Lang = 'zh' | 'en';

export const AREA_IDS = ['C', 'W', 'N', 'B', 'M'] as const satisfies readonly AreaId[];
export const SECTION_IDS = ['C', 'W', 'N', 'B', 'M', 'G'] as const satisfies readonly SectionId[];

export const ROLE_IDS = ['ug4', 'cc', 'grad', 'emp', 'gig', 'free', 'owner', 'seek', 'care', 'ret', 'oth'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Where day-to-day money comes from: own earnings, support (family, grants, loans), or a partner's income. */
export const MONEY_IDS = ['own', 'sup', 'hh'] as const;
export type MoneyId = (typeof MONEY_IDS)[number];

/** Income tier set by the first wealth question. It decides the amounts shown in later questions. */
export const TIER_IDS = ['sup', 'low', 'mid', 'high'] as const;
export type TierId = (typeof TIER_IDS)[number];

export const FIELD_IDS = [
  'tech', 'biz', 'law', 'health', 'edu', 'arts', 'sport', 'sales', 'trade', 'move', 'gov', 'care', 'agri', 'oth',
] as const;
export type FieldId = (typeof FIELD_IDS)[number];

/**
 * Where a scored input came from. Every scored input carries one.
 * questionnaire: the check itself. daily_open, payday, weekly_win, people_nudge: the micro apps
 * for body and mind, wealth, capability and network. connected: a linked source such as step
 * counts from a phone.
 */
export const SOURCES = ['questionnaire', 'daily_open', 'payday', 'weekly_win', 'people_nudge', 'connected'] as const;
export type Source = (typeof SOURCES)[number];

/** Position of the tapped option in the order it was displayed. */
export type Where = 'first' | 'middle' | 'last';

/**
 * Direction the free (unpinned) options were displayed in.
 * worst_first is the order of the bank; best_first is that order reversed. The names describe
 * the usual case, where the bank lists options from the lowest score to the highest. They are
 * nominal for a question whose best option is not at the end: the sleep question (B3) scores
 * "7 to 9" hours 1 and "More than 9" 0.625, so under best_first it opens with "More than 9".
 * Analysis by direction must read the label as "reversed" or "bank order", not as a statement
 * about scores.
 */
export type OrderDirection = 'best_first' | 'worst_first';

// ---------------------------------------------------------------- bank

export interface Bilingual {
  zh: string;
  en: string;
}

/** Load of one question on each sector. Missing means zero. */
export type Loads = Partial<Record<AreaId, number>>;

export const CONTEXT_KEYS = ['role', 'money', 'field', 'nowork', 'tier', 'mgr'] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];
export type ContextValue = string | number | null;

/** One wording of a question. The first version whose `when` matches the context is the one asked. */
export interface ItemVersion {
  key: string;
  /** Conditions on the context. An empty object is the fallback. */
  when: Partial<Record<ContextKey, ContextValue[]>>;
  q: Bilingual;
  opts: Bilingual[];
  /** Score of each option, 0 to 1. null means the option is not scored. Internal: never shown to users. */
  s: Array<number | null>;
  /** Option indices that stay last when the display order is flipped. Display only, unrelated to scoring. */
  pin: number[];
  /** Overrides the loads of the question for this version. */
  load?: Loads;
  /** Income tier written to the context for each option. */
  tier?: TierId[];
  /** Whether each option counts as managing people (written to the context). */
  mgr?: Array<0 | 1>;
}

export interface BankItem {
  area: SectionId;
  load: Loads;
  versions: ItemVersion[];
}

/** ["alt", key, value, a, b]: ask a when context[key] equals value, otherwise b. */
export type AltSlot = ['alt', ContextKey, ContextValue, string, string];
/** ["skip", key, value, id]: leave the question out when context[key] equals value. */
export type SkipSlot = ['skip', ContextKey, ContextValue, string];
export type CompSlot = string | AltSlot | SkipSlot;

/** A background question asked after age and role. */
export interface ExtraQuestion {
  id: string;
  q: Bilingual;
  opts: Bilingual[];
}

export interface BankTiming {
  /** Words a second a reader can glance over (English). */
  en: number;
  /** Characters a second a reader can glance over (Chinese). */
  zh: number;
  tmin: number;
  tmax: number;
  floor: number;
}

export interface Bank {
  name: string;
  bank_version: string;
  status: string;
  areas: Record<AreaId, Bilingual & { tick: string }>;
  /** Order of the sectors in the questionnaire. */
  order: AreaId[];
  section: Record<SectionId, Bilingual>;
  roles: Array<Bilingual & { id: RoleId }>;
  ages: Bilingual[];
  baseQ: { age: Bilingual; role: Bilingual };
  extra: Record<RoleId, ExtraQuestion[]>;
  fieldIds: FieldId[];
  moneyIds: MoneyId[];
  items: Record<string, BankItem>;
  comp: Record<RoleId, CompSlot[]>;
  /** Timing as shipped with the bank. The engine reads timing from config.ts; a test asserts both agree. */
  timing: BankTiming;
}

// ---------------------------------------------------------------- inputs

export interface Background {
  /** Index into bank.ages. */
  age: number;
  role: RoleId;
  /** Option index of each background question of the role, by question id (field, year, stage, exp, money). */
  extra: Record<string, number>;
}

/** Routing attributes. role, money, field and nowork come from the background; tier and mgr are set by answers. */
export interface Context {
  role: RoleId;
  money: MoneyId;
  field: FieldId | null;
  nowork: 0 | 1;
  tier: TierId | null;
  mgr: 0 | 1;
}

/** One question as it was answered or skipped. Raw record: append only. */
export interface Step {
  /** Question id. */
  id: string;
  /** Version key that was shown. */
  key: string;
  /** Option index. null means the question was skipped. */
  k: number | null;
  /** Seconds from display to answer. null means not timed. */
  secs: number | null;
  /** Language shown when the answer was given. The time threshold is computed in this language. */
  lang: Lang;
  /**
   * Display position of the tapped option. Every answered questionnaire step should carry it:
   * check f11 counts a step without it as neither first nor last. compute reports how many
   * are missing in Result.positionsMissing.
   */
  where?: Where;
  order?: OrderDirection;
  source: Source;
}

/** Replaces the option index of one question, for example with data from the daily open or payday check. */
export interface Override {
  itemId: string;
  k: number;
  source: Source;
}

/** A synthetic scored item that is not in the bank, for example the daily state question. */
export interface Extra {
  id: string;
  /** Sector the item belongs to. It counts as one of that sector's own items. */
  area: AreaId;
  /** Must hold a load above 0 on `area`. Without one the item could not count in its own sector. */
  load: Loads;
  /** 0 to 1. */
  score: number;
  source: Source;
}

export interface SelectionOptions {
  /** Sectors the person did not consent to. Their questions are never asked. */
  excludedAreas?: readonly AreaId[];
  /** Algorithm version to select with. Defaults to CURRENT.algo. */
  algo?: number;
}

/** The three versions a result depends on. */
export interface VersionSet {
  algo: number;
  bank: string;
  norm: string;
}

/** Sector prices of an earlier record, used for top gainer and top loser. */
export type PreviousPrices = Partial<Record<AreaId, number | null>>;

export interface ComputeInput {
  bank: Bank;
  background: Background;
  steps: readonly Step[];
  /** Defaults to CURRENT. versions.bank, when given, must equal bank.bank_version. */
  versions?: Partial<VersionSet>;
  excludedAreas?: readonly AreaId[];
  overrides?: readonly Override[];
  extras?: readonly Extra[];
  /** Sector prices of the previous record. Without it the result has no top gainer or top loser. */
  previous?: PreviousPrices | null;
  /**
   * True while a mind notice from outside the questionnaire is shown, for example the daily
   * open rule of "very bad" on 5 of the last 7 days. The caller evaluates that rule. While
   * the notice is shown the mind sector is never the laggard. See Result.mindNotice.
   */
  mindNotice?: boolean;
}

// ---------------------------------------------------------------- norms and parameters

export interface SectorNorm {
  median: number;
  sd: number;
}

export interface NormSet {
  /** True while the values are a design setting and not estimated from real data. The result page must say so. */
  provisional: boolean;
  sectors: Record<AreaId, SectorNorm>;
  /** Optional norms for one role. A sector missing here falls back to `sectors`. */
  byRole?: Partial<Record<RoleId, Partial<Record<AreaId, SectorNorm>>>>;
}

export interface TimingParams {
  /** Characters (zh) or words (en) a minute a reader can glance over. */
  scanPerMinute: Record<Lang, number>;
  thresholdMinSeconds: number;
  thresholdMaxSeconds: number;
  /** Lowest weight multiplier an answer can get. */
  multiplierFloor: number;
}

// ---------------------------------------------------------------- outputs

export interface NextQuestion {
  id: string;
  key: string;
  version: ItemVersion;
  /** Section the question is shown under (key of bank.section). */
  section: SectionId;
  /** Zero-based position among the questions this person is asked. */
  index: number;
  /** Number of questions this person is asked. */
  total: number;
}

export interface Progress {
  /** Questions already answered or skipped. */
  asked: number;
  total: number;
  remaining: number;
}

export type SectorStatus = 'listed' | 'insufficient' | 'unlisted';

export interface SectorResult {
  /**
   * listed: has a price. insufficient: too few of its own questions were scored.
   * unlisted: the person did not consent to this sector.
   */
  status: SectorStatus;
  price: number | null;
  /** Price with every answer counted at full weight. */
  priceFullWeight: number | null;
  /** Share of weight kept after the time discount, 0 to 1. */
  keep: number | null;
  /**
   * Internal 0 to 1 value after the time discount and the interest correction.
   * Kept for norms and recomputation. It must never be shown to users: users see prices only.
   */
  raw: number | null;
  /** Own questions of the sector on this person's path (extras included). */
  ownItems: number;
  /** How many of them have a score. */
  ownScored: number;
}

export type FlagId = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12';
export type Grade = 'A' | 'B' | 'C';
export type ContrastId = 'c1a' | 'c1b' | 'c2a' | 'c2b' | 'c3a' | 'c3b' | 'c4a' | 'c4b' | 'c6a' | 'c6b';

export interface Flag {
  id: FlagId;
  points: number;
}

export interface SocialPosition {
  /** Mean of the wealth and capability prices. */
  objectivePrice: number;
  /** Rung 1 to 10 that the objective price corresponds to. */
  objectiveRung: number;
  /** Option index of the ladder question (0 to 4). */
  ladder: number;
  /** The two rungs the chosen ladder option covers. */
  ladderRungs: [number, number];
  /** Midpoint of the chosen rungs minus the objective rung. */
  gap: number;
  /** below: own placement well below circumstances. above: well above. close: the two are close. */
  gapKind: 'below' | 'above' | 'close';
}

export type SectorTag = 'limit_up' | 'limit_down' | 'leader' | 'laggard';

export interface SectorMove {
  area: AreaId;
  /** Price now minus price in the previous record. */
  delta: number;
}

/**
 * How the compared sectors moved since the previous record. A change within the unchanged
 * band of the parameters counts as no move.
 * - all_up: every compared sector rose. all_down: every compared sector fell.
 * - mixed: at least one rose and at least one fell.
 * - some_up: at least one rose, none fell, at least one is unchanged.
 * - some_down: at least one fell, none rose, at least one is unchanged.
 * - unchanged: no compared sector moved.
 */
export type MarketChangeKind = 'all_up' | 'all_down' | 'mixed' | 'some_up' | 'some_down' | 'unchanged';

export interface MarketChange {
  kind: MarketChangeKind;
  /** The largest rise. Set for all_up, some_up and mixed, otherwise null. */
  topGainer: SectorMove | null;
  /** The largest fall. Set for all_down, some_down and mixed, otherwise null. */
  topLoser: SectorMove | null;
  /** Change of every sector priced in both records. */
  deltas: Partial<Record<AreaId, number>>;
}

/** The data behind the one-line market commentary and the sector tags. Text lives in src/copy. */
export interface Market {
  /** Number of sectors with a price. */
  pricedCount: number;
  /** True when the highest and lowest priced sectors are less than the flat band apart. No leader, laggard or type then. */
  flat: boolean;
  leader: AreaId | null;
  /** null when flat, and also when the lowest sector is mind while the mind notice is shown. */
  laggard: AreaId | null;
  /** One tag per sector at most. */
  tags: Record<AreaId, SectorTag | null>;
  /** null without a previous record, or when fewer sectors than the mover minimum are priced in both. */
  change: MarketChange | null;
}

export interface StepDetail {
  id: string;
  key: string;
  section: SectionId;
  /** Option index used for scoring, after overrides. null when skipped and not overridden. */
  k: number | null;
  /** Option index answered in the questionnaire. null when skipped. */
  answeredK: number | null;
  skipped: boolean;
  overridden: boolean;
  /** Internal 0 to 1 score of the option used. Never shown to users. */
  score: number | null;
  /** Seconds below which the answer counts at reduced weight. */
  threshold: number;
  /** Weight multiplier from the answer time alone (1 when skipped or not timed). */
  timeMultiplier: number;
  /** Weight multiplier used for scoring (1 for overridden answers). */
  multiplier: number;
  source: Source;
}

export interface ExtraDetail {
  id: string;
  area: AreaId;
  source: Source;
  /** False when the sector of the extra is excluded. */
  counted: boolean;
}

export interface Result {
  versions: VersionSet;
  /** True while the norms are provisional. The result page must show the note about it. */
  normProvisional: boolean;
  /** Routing context after the last answer. */
  context: Context;
  sectors: Record<AreaId, SectorResult>;
  /** Mean price of the sectors in overallCovers. null when fewer sectors are priced than the minimum. */
  overall: number | null;
  overallFullWeight: number | null;
  /** Sectors the overall price covers, in questionnaire order. Empty when there is no overall price. */
  overallCovers: AreaId[];
  /** Sectors without a price. Look at sectors[a].status for the reason. */
  overallLeftOut: AreaId[];
  /** Mean time multiplier over the answered questions. */
  keepAll: number;
  reducedWeight: {
    /** Answers counted at reduced weight because they came faster than the stem could be read. */
    count: number;
    /** Points this moved the overall price toward 100 (absolute difference from the full-weight price). */
    points: number | null;
  };
  /** True when the interest question was answered and not answered correctly. */
  interestWrong: boolean;
  flags: Flag[];
  flagPoints: number;
  grade: Grade;
  contrasts: ContrastId[];
  /** The questionnaire rule alone: "nearly every day" on both mood questions. */
  mindAlert: boolean;
  /**
   * True when the mind notice is to be shown: mindAlert, or the notice passed in as
   * ComputeInput.mindNotice. This is the value `market` was computed with, so while it is
   * true the mind sector is not the laggard and carries no laggard tag.
   */
  mindNotice: boolean;
  /** Priced sectors from highest to lowest price. */
  rank: AreaId[];
  socialPosition: SocialPosition | null;
  /** The two highest sectors. null when flat or fewer than two sectors are priced. */
  type: [AreaId, AreaId] | null;
  market: Market;
  counts: {
    /** Questions on this person's path. */
    total: number;
    answered: number;
    skipped: number;
  };
  /**
   * Answered questionnaire steps that carry no `where`. It should be 0. Above 0, check f11
   * (same tap position) saw fewer positions than there were and the data grade may be too good.
   */
  positionsMissing: number;
  steps: StepDetail[];
  extras: ExtraDetail[];
}

// ---------------------------------------------------------------- algorithm contract

export interface AlgoComputeInput extends ComputeInput {
  /** Fully resolved versions. */
  versions: VersionSet;
  norm: NormSet;
}

/** What every algorithm version implements. registry.ts maps version numbers to these. */
export interface Algo {
  readonly version: number;
  readonly timing: TimingParams;
  contextOf(bank: Bank, background: Background): Context;
  nextQuestion(
    bank: Bank,
    background: Background,
    steps: readonly Step[],
    opts?: SelectionOptions,
  ): NextQuestion | null;
  progressOf(bank: Bank, background: Background, steps: readonly Step[], opts?: SelectionOptions): Progress;
  orderDirection(rngFloat: number): OrderDirection;
  displayOrder(version: ItemVersion, rngFloat: number): number[];
  /** The displayed order for a stored direction (Step.order), without a random number. */
  displayOrderFor(version: ItemVersion, direction: OrderDirection): number[];
  whereOf(k: number, order: readonly number[]): Where;
  readUnits(text: string, lang: Lang): number;
  thresholdFor(text: string, lang: Lang, params?: TimingParams): number;
  multiplierFor(secs: number | null, threshold: number, params?: TimingParams): number;
  marketOf(
    prices: Partial<Record<AreaId, number | null>>,
    order: readonly AreaId[],
    /** True while the mind notice is shown, whatever its origin (Result.mindNotice). */
    mindAlert: boolean,
    previous?: PreviousPrices | null,
  ): Market;
  compute(input: AlgoComputeInput): Result;
}

/** Thrown for input the engine cannot score: unknown question, version, option, role or version number. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
