/**
 * The API contract between the app and the server.
 *
 * Every request and response body of every /api endpoint is typed here, together with the
 * constants both sides need (limits, id lists, consent text versions) and the error shape.
 * The server (src/server) validates against these; the app calls them through the typed client
 * in ./client.ts.
 *
 * Conventions
 * - JSON in, JSON out. Field names are camelCase.
 * - Timestamps are ISO 8601 UTC strings. Days are "YYYY-MM-DD" strings.
 * - Signed-in calls send `Authorization: Bearer <device token>`.
 * - Team calls send `Authorization: Bearer <team passphrase>`.
 * - A failed call returns an HTTP status of 400 or above and an ApiErrorBody.
 * - The server never stores or logs IP addresses or user agents.
 *
 * Endpoint list (method, path, request type, response type)
 *
 *   GET    /api/health                   -                          HealthResponse
 *   GET    /api/config                   -                          ConfigResponse
 *   POST   /api/users                    CreateUserRequest          CreateUserResponse      (201)
 *   POST   /api/restore                  RestoreRequest             RestoreResponse
 *   POST   /api/recovery/rotate          -                          RotateRecoveryResponse  (auth)
 *   POST   /api/signout                  -                          OkResponse              (auth)
 *   POST   /api/consent                  ConsentRequest             ConsentResponse         (auth)
 *   GET    /api/me?today=                -                          MeResponse              (auth)
 *   GET    /api/me/export                -                          ExportResponse          (auth)
 *   POST   /api/me/delete                DeleteMeRequest            DeleteMeResponse        (auth)
 *   GET    /api/me/breakdown?from=&to=   -                          BreakdownResponse       (auth)
 *   GET    /api/me/breakdown/day?day=&from=&today=   -              DayBreakdownResponse    (auth)
 *   POST   /api/daily                    DailyEntryRequest          MicroEntryResponse      (auth, 201)
 *   POST   /api/payday                   PaydayEntryRequest         MicroEntryResponse      (auth, 201)
 *   POST   /api/weekly-wins              WeeklyWinRequest           MicroEntryResponse      (auth, 201)
 *   POST   /api/people-nudges            PeopleNudgeRequest         MicroEntryResponse      (auth, 201)
 *   POST   /api/sessions                 CreateSessionRequest       CreateSessionResponse   (auth)
 *   GET    /api/sessions/open            -                          OpenSessionResponse     (auth)
 *   GET    /api/sessions/:id             -                          SessionResponse         (auth)
 *   POST   /api/sessions/:id/events      PostEventsRequest          PostEventsResponse      (auth)
 *   POST   /api/sessions/:id/complete    -                          CompleteSessionResponse (auth)
 *   POST   /api/report-events            PostReportEventsRequest    PostReportEventsResponse (auth)
 *   POST   /api/visits                   VisitRequest               VisitResponse           (auth)
 *   POST   /api/compare/invites          -                          CreateInviteResponse    (auth, 201)
 *   POST   /api/compare/invites/lookup   InviteLookupRequest        InviteLookupResponse
 *   POST   /api/compare/accept           AcceptInviteRequest        AcceptInviteResponse    (auth)
 *   GET    /api/compare                  -                          ComparisonsResponse     (auth)
 *   GET    /api/compare/:id              -                          ComparisonResponse      (auth)
 *   POST   /api/compare/:id/delete       -                          DeleteComparisonResponse (auth)
 *   GET    /api/team/overview            -                          TeamOverviewResponse    (team)
 *   GET    /api/team/items?role=         -                          TeamItemsResponse       (team)
 *   GET    /api/team/prices              -                          TeamPricesResponse      (team)
 *   GET    /api/team/norms               -                          TeamNormsResponse       (team)
 *   GET    /api/team/returns             -                          TeamReturnsResponse     (team)
 *   GET    /api/team/report              -                          TeamReportResponse      (team)
 *   GET    /api/team/daily               -                          TeamDailyResponse       (team)
 *   GET    /api/team/apps                -                          TeamAppsResponse        (team)
 *   GET    /api/team/gates               -                          TeamGatesResponse       (team)
 *   GET    /api/team/tests               -                          TeamTestsResponse       (team)
 *
 * The four micro-app endpoints (daily, payday, weekly-wins, people-nudges) answer 403
 * feature_off while their flag in GET /api/config is off.
 *
 * Every /api/team table is also served as CSV with `?format=csv`. Every team response carries
 * `demoPeople`; a CSV carries it in the `x-standing-demo-people` header.
 */

import type {
  AreaId,
  Background,
  Breakdown,
  CertificateLevel,
  EVALUATION,
  FairnessTest,
  GamingTest,
  Grade,
  Lang,
  NudgeCategory,
  OrderDirection,
  PaydayBaseline,
  RangeTest,
  ResponseTest,
  Result,
  RoleId,
  StabilityTest,
  Step,
  Streak,
  TimelineMarker,
  TimelineStatus,
  ValidityTest,
  VersionEffectTest,
  VersionSet,
  WeeklyWinKind,
  Where,
} from '../engine';

// ---------------------------------------------------------------- constants

export const API_BASE = '/api';

/**
 * Version ids of the consent texts. The text shown to the user lives in src/i18n; when its
 * meaning changes, add a new id here, keep the old one in ACCEPTED_CONSENT_VERSIONS, and point
 * CONSENT_VERSIONS at the new one. The server stores the id the user agreed to and the time.
 */
export const CONSENT_VERSIONS = {
  /** What is collected, why, where it is stored, how to delete it. */
  general: 'general-1',
  /** Separate consent for the body and mind answers. */
  health: 'health-1',
} as const;

/** Version ids the server accepts. Old ids stay valid so a stale page can still save. */
export const ACCEPTED_CONSENT_VERSIONS: Record<ConsentKind, readonly string[]> = {
  general: ['general-1'],
  health: ['health-1'],
};

export const CONSENT_KINDS = ['general', 'health'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Sectors that need the health consent. Without it their questions are never asked. */
export const HEALTH_AREAS = ['B', 'M'] as const satisfies readonly AreaId[];

export const EVENT_ACTIONS = ['shown', 'select', 'skip', 'na'] as const;
/**
 * shown: the question appeared. select: an option was tapped. skip: the skip link was tapped.
 * na: the person marked the question as not applicable to them. Like a skip it has no score;
 * the team counts the two apart.
 */
export type EventAction = (typeof EVENT_ACTIONS)[number];

/** The actions that answer a question. Each question gets exactly one of them. */
export const ANSWER_ACTIONS = ['select', 'skip', 'na'] as const satisfies readonly EventAction[];
export type AnswerAction = (typeof ANSWER_ACTIONS)[number];

/**
 * Most events one POST may carry. A session has at most 34 questions and two events per
 * question, so a whole offline queue fits in one request.
 */
export const MAX_EVENTS_PER_REQUEST = 80;

/**
 * Largest answer time the server accepts, in seconds. The scoring weight is already 1 long
 * before this, so the client caps the measured time here (see clampSeconds) before sending.
 */
export const MAX_ANSWER_SECONDS = 3600;

/** Caps a measured answer time to the range the server accepts. */
export function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_ANSWER_SECONDS);
}

/** Ticker: 2 to 6 letters or digits. Optional, not unique. Stored in upper case. */
export const TICKER_PATTERN = /^[A-Za-z0-9]{2,6}$/;

/** Session ids a client may propose: 16 to 64 URL-safe characters. */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** US states and the District of Columbia, by postal code. The state is optional. */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;
export type UsState = (typeof US_STATES)[number];

/**
 * Sections of the result page, top to bottom (PROMPT.md section 6). Report events name one of
 * these. They are recorded to improve the report and never enter scoring.
 */
export const REPORT_SECTIONS = [
  'mind_notice',
  'header',
  'key_stats',
  'chart',
  'commentary',
  'timing_note',
  'sector_table',
  'radar',
  'type',
  'social_position',
  'contrasts',
  'checks',
  'norm_note',
  'share',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const REPORT_EVENT_KINDS = ['seen', 'dwell', 'share', 'useful'] as const;
/**
 * seen: the section scrolled into view. dwell: time it stayed in view, in `ms`.
 * share: the share action was used from this section. useful: the "was this useful" click,
 * with `useful` true or false.
 */
export type ReportEventKind = (typeof REPORT_EVENT_KINDS)[number];

export const MAX_REPORT_EVENTS_PER_REQUEST = 50;
/** Longest dwell one event may report: 30 minutes. Longer stays are sent capped. */
export const MAX_DWELL_MS = 30 * 60 * 1000;

/** A visit date may differ from the server's UTC date by at most this many days. */
export const VISIT_MAX_SKEW_DAYS = 1;

/** The four micro apps of stage 2, one or two sectors each. Also the `source` of their records. */
export const MICRO_APPS = ['daily_open', 'payday', 'weekly_win', 'people_nudge'] as const;
export type MicroApp = (typeof MICRO_APPS)[number];

/**
 * Every field a payday request may carry. Anything else is refused with amounts_not_accepted:
 * the three amounts and the setup stay on the device, and the server takes bands only.
 */
export const PAYDAY_ENTRY_FIELDS = ['id', 'localDate', 'periods', 'saveShare', 'runway', 'baselineDay'] as const;

// ---------------------------------------------------------------- errors

export const API_ERROR_CODES = [
  'invalid_json',
  'invalid_request',
  'unauthorized',
  'not_found',
  'method_not_allowed',
  'payload_too_large',
  'consent_required',
  'health_consent_required',
  'consent_version_unknown',
  'recovery_code_invalid',
  'bank_version_mismatch',
  'session_completed',
  'session_incomplete',
  'event_invalid',
  'event_not_on_path',
  'event_out_of_order',
  'id_conflict',
  'check_required',
  'invite_invalid',
  'invite_own',
  'invite_limit',
  'feature_off',
  'day_closed',
  'payday_not_eligible',
  'amounts_not_accepted',
  'entry_limit',
  'team_closed',
  'team_unauthorized',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every failed call. `message` is for developers and logs, never for users. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Extra facts, for example the index of the event that failed validation. */
    details?: Record<string, unknown>;
  };
}

export interface OkResponse {
  ok: true;
}

// ---------------------------------------------------------------- health and config

export type EnvironmentName = 'local' | 'preview' | 'production';

/** GET /api/health */
export interface HealthResponse {
  ok: boolean;
  environment: EnvironmentName;
}

/** Stage switches. Each is on locally and off in production by default. */
export interface FeatureFlags {
  dailyOpen: boolean;
  payday: boolean;
  weeklyWin: boolean;
  peopleNudge: boolean;
}

/** GET /api/config. No sign-in needed. */
export interface ConfigResponse {
  environment: EnvironmentName;
  flags: FeatureFlags;
  /** Versions new results are computed with. A client whose bundled bank differs must reload. */
  versions: VersionSet;
  consentVersions: Record<ConsentKind, string>;
  /** False when no team passphrase is configured: the dashboard is closed. */
  teamOpen: boolean;
}

// ---------------------------------------------------------------- accounts and consent

export interface ConsentRecord {
  /** Version id of the text the user agreed to. */
  version: string;
  /** When they agreed. */
  at: string;
}

export interface ConsentState {
  general: ConsentRecord;
  /** null: no consent for body and mind answers. Those sectors stay unlisted. */
  health: ConsentRecord | null;
}

/**
 * POST /api/users. The first save. There is no sign-up: the server creates a record with a
 * random id and returns a device token and a recovery code, each exactly once. Only their
 * SHA-256 hashes are stored.
 */
export interface CreateUserRequest {
  consent: {
    /** Version id of the general consent text the user agreed to. Required. */
    general: string;
    /** Version id of the health consent text, or null when the user declined it. */
    health: string | null;
  };
  lang: Lang;
}

export interface CreateUserResponse {
  userId: string;
  /** Keep on the device. Send as `Authorization: Bearer`. Never shown again. */
  deviceToken: string;
  /** For the settings page: typing it on another device connects to the same record. */
  recoveryCode: string;
  consent: ConsentState;
}

/** POST /api/restore. Issues a new device token for the record the recovery code belongs to. */
export interface RestoreRequest {
  /** As typed. Case, spaces and dashes are ignored; O reads as 0, I and L read as 1. */
  recoveryCode: string;
}

export interface RestoreResponse {
  userId: string;
  deviceToken: string;
}

/** POST /api/recovery/rotate. The old code stops working at once. */
export interface RotateRecoveryResponse {
  recoveryCode: string;
}

/**
 * POST /api/consent. Grants or withdraws the health consent, or records agreement to a newer
 * general text. The general consent cannot be withdrawn here: use POST /api/me/delete.
 * Withdrawing the health consent stops the server from accepting body and mind answers and
 * turns any unfinished check into a three-sector check. It deletes nothing.
 */
export interface ConsentRequest {
  kind: ConsentKind;
  granted: boolean;
  /** Version id of the text shown. Required when granting. */
  version: string;
}

export interface ConsentResponse {
  consent: ConsentState;
}

// ---------------------------------------------------------------- sessions and events

/**
 * POST /api/sessions. Starts a check. Needs the general consent. `healthConsent: true` needs
 * the stored health consent, otherwise the call fails with health_consent_required.
 */
export interface CreateSessionRequest {
  /**
   * Optional id chosen by the client so a retried request does not create a second session.
   * Must match CLIENT_ID_PATTERN.
   */
  id?: string;
  /** Age band (index into bank.ages), role, and the role's background answers by question id. */
  background: Background;
  usState?: UsState | null;
  ticker?: string | null;
  /** Language shown when the check starts. Each event carries its own. */
  lang: Lang;
  /** Version of the bank bundled in the client. Must be the server's current bank. */
  bankVersion: string;
  /** False: body and mind questions are left out and the two sectors are unlisted. */
  healthConsent: boolean;
  /** The device's local date, for return rates. Checked against server time like a visit. */
  localDate?: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  completedAt: string | null;
  background: Background;
  usState: UsState | null;
  ticker: string | null;
  lang: Lang;
  bankVersion: string;
  healthConsent: boolean;
  /** Sectors left out of this check: [] or ["B", "M"]. Pass to the engine as excludedAreas. */
  excludedAreas: AreaId[];
}

export interface CreateSessionResponse {
  session: SessionInfo;
  /** False when `id` named a session that already existed (a retried request). */
  created: boolean;
}

/**
 * GET /api/sessions/:id. The stored steps let the client resume: feed them to the engine's
 * nextQuestion to get the question the person left on.
 */
export interface SessionResponse {
  session: SessionInfo;
  /** Answered, skipped and not-applicable questions in order, rebuilt from the stored events. */
  steps: Step[];
  /**
   * The question that was shown but not yet answered when the person left, if any. Reuse its
   * display direction so the options do not flip on return.
   */
  pending: { seq: number; itemId: string; versionKey: string; displayDirection: OrderDirection } | null;
}

/** GET /api/sessions/open. The latest unfinished check of this user, or null. */
export interface OpenSessionResponse {
  open: SessionResponse | null;
}

/**
 * One question event. Two are sent per question: "shown" when it appears, then "select",
 * "skip" or "na" (not applicable). They are sent as they happen, never batched at the end, so
 * the team can see where people leave.
 */
export interface QuestionEventInput {
  /**
   * Number of questions answered or skipped before this one in this session: steps.length at
   * the moment the question is shown. This equals NextQuestion.index, except after the health
   * consent was withdrawn in the middle of a check, so always send steps.length.
   */
  seq: number;
  action: EventAction;
  itemId: string;
  /** Key of the version that was shown (NextQuestion.key). */
  versionKey: string;
  /** Language on screen at the moment of the event. */
  lang: Lang;
  /** select: index of the tapped option in bank order (not display order). Otherwise null. */
  optionIndex: number | null;
  /**
   * select, skip and na: seconds from display to tap, 0 to MAX_ANSWER_SECONDS (use
   * clampSeconds). skip and na may send null. shown: null.
   */
  seconds: number | null;
  /** Direction the options were displayed in (orderDirection of the engine). */
  displayDirection: OrderDirection;
  /** select: where the tapped option sat on screen (whereOf of the engine). Otherwise null. */
  clickPosition: Where | null;
  bankVersion: string;
}

/**
 * POST /api/sessions/:id/events. Usually one event; an array so an offline queue can flush.
 *
 * The batch is all or nothing. Events are checked in array order against the bank and against
 * the path the engine gives for the stored answers. If one fails, nothing is stored and the
 * error names it in details.index, so the client can drop it and retry the rest.
 * Sending an event again is safe: (session, seq, action) is the idempotency key, and the first
 * answer to a question wins.
 */
export interface PostEventsRequest {
  events: QuestionEventInput[];
}

export type EventStatus = 'stored' | 'duplicate';

export interface PostEventsResponse {
  /** One entry per event sent, in the same order. */
  results: Array<{ seq: number; action: EventAction; status: EventStatus }>;
  /** Questions answered, skipped or marked not applicable so far. */
  answered: number;
  /** True when every question on the path has an answer, a skip or an na: call complete next. */
  finished: boolean;
}

/** A stored, derived result. `result` is the engine's output; its internal 0 to 1 values must not be shown. */
export interface StoredResult {
  sessionId: string;
  completedAt: string;
  computedAt: string;
  versions: VersionSet;
  result: Result;
}

/** Change of the overall price against the previous completed check. */
export interface OverallChange {
  previousSessionId: string;
  previousAt: string;
  previousOverall: number | null;
  /** Points. null when either check has no overall price. */
  delta: number | null;
  /** Percent of the previous price. null when delta is null. */
  percent: number | null;
}

/**
 * POST /api/sessions/:id/complete. The server rebuilds the steps from the stored events, runs
 * the engine and stores the result with its three versions. Calling it again returns the same
 * stored result. Fails with session_incomplete while questions are left.
 */
export interface CompleteSessionResponse {
  stored: StoredResult;
  /** null for the first check: "first record, no change yet". */
  change: OverallChange | null;
}

// ---------------------------------------------------------------- me

export interface UserProfile {
  id: string;
  createdAt: string;
  lang: Lang;
  /** From the latest check. null before the first one. */
  ticker: string | null;
  usState: UsState | null;
  /** Index into bank.ages. */
  age: number | null;
  role: RoleId | null;
}

/** One completed check, for the chart. */
export interface HistoryPoint {
  sessionId: string;
  at: string;
  overall: number | null;
  /** Price of each sector. null: no price (unlisted or not enough data). */
  sectors: Record<AreaId, number | null>;
  grade: Grade;
  /** Versions the point was computed with. A change between two points is drawn as a line on the chart. */
  versions: VersionSet;
}

/** GET /api/me. Everything the home page needs in one call. */
export interface MeResponse {
  user: UserProfile;
  consent: ConsentState;
  /** Result of the latest completed check. */
  latest: StoredResult | null;
  /** Change of the latest check against the one before it. */
  change: OverallChange | null;
  /** All completed checks, oldest first. */
  history: HistoryPoint[];
  /** Highest and lowest overall price over the history. null without a priced check. */
  allTime: { high: number | null; low: number | null };
  /** The latest unfinished check, if any, so the home page can offer to resume it. */
  openSession: { id: string; createdAt: string; answered: number } | null;
  /**
   * Days on which the algorithm, the bank or the norm changed, oldest first. The chart draws a
   * vertical line on each. Empty until the first change.
   */
  versionMarkers: VersionMarker[];
  /**
   * The day-by-day price since the first full check, computed now by the engine from the stored
   * checks and micro-app records. null before the first completed check. Nothing in it is stored.
   */
  live: MeLive | null;
}

/** One sector today. */
export interface LiveSector {
  /** listed, insufficient, unlisted, or halted: priced and holding its price for lack of fresh data. */
  status: TimelineStatus;
  /** The price shown today, after the daily limit and halts. null without a price. */
  price: number | null;
  /** The price today's data gives. The shown price moves toward it by at most `moveLimit` a day. */
  target: number | null;
  /** Points against yesterday's shown price. null on the first day or without a price on both days. */
  change: number | null;
  /** Points against the shown price on the day of the last full check. */
  sinceCheck: number | null;
  /** "up" or "down" when today's move was cut at the daily limit and the rest carries over. */
  dailyLimit: 'up' | 'down' | null;
  /** True on the day a halt ends: halted yesterday, listed today. */
  resumed: boolean;
  /** First day of the halt the sector is in. null unless halted. */
  haltedSince: string | null;
}

/** State of one micro app for the signed-in person today. */
export interface LiveApp {
  /** The stage switch of the app (GET /api/config). */
  enabled: boolean;
  /** True when the person may use it: enabled, and for the daily open the health consent, for payday eligibility. */
  available: boolean;
  /** True when an entry was recorded today. */
  recordedToday: boolean;
  /** True when an entry was recorded in the calendar week of today (weeks start on Monday). */
  recordedThisWeek: boolean;
  /** The last day with an entry. null when the app was never used. */
  lastDay: string | null;
}

/** GET /api/me, `live`. Prices in `series` are rounded to two decimals; the other numbers are not rounded. */
export interface MeLive {
  /** The day the series ends on: the `today` query parameter, or the server's UTC date. */
  today: string;
  /**
   * One value per day from `start`, the day of the first full check, to `today`: index i is
   * `start` plus i days. Shown prices. null where there is no price.
   */
  series: {
    start: string;
    length: number;
    overall: Array<number | null>;
    sectors: Record<AreaId, Array<number | null>>;
  };
  /** Days to mark on the chart, oldest first: full checks and changes of version. */
  markers: TimelineMarker[];
  /** Stretches in which a sector was halted. `to` is the last halted day, null while the halt lasts. */
  halts: Array<{ area: AreaId; from: string; to: string | null }>;
  overall: {
    price: number | null;
    target: number | null;
    /** Points and percent against yesterday. null on the first day. */
    change: number | null;
    changePercent: number | null;
    /** Points and percent against the day of the last full check. */
    sinceCheck: number | null;
    sinceCheckPercent: number | null;
    /** Sectors the overall price is the mean of. */
    covers: AreaId[];
  };
  sectors: Record<AreaId, LiveSector>;
  /** Highest and lowest shown overall price of the series, with the first day each was reached. */
  allTime: { high: number | null; highDay: string | null; low: number | null; lowDay: string | null };
  /** Day of the last full check. */
  lastCheckDay: string;
  /** True while the mind notice is shown, from the check or from the daily records. */
  mindNotice: boolean;
  /** The daily open streak. `canBackfill` lists the days before today that can still be filled in. */
  streak: Streak;
  apps: {
    dailyOpen: LiveApp;
    payday: LiveApp & {
      /** True when the payday check is offered to this person (own earnings, an eligible role). */
      eligible: boolean;
      /** What the device needs for paydayBandsFor: the runway answer of the last full check. Send its `day` as baselineDay. */
      baseline: PaydayBaseline | null;
    };
    weeklyWin: LiveApp;
    peopleNudge: LiveApp;
  };
  /** The quarterly retake prompt. `daysUntil` is 0 once it is due. */
  retake: { due: boolean; daysSinceCheck: number; daysUntil: number; dueDay: string };
  /** Most points a sector moves in one day, from the algorithm in force. */
  moveLimit: number;
}

// ---------------------------------------------------------------- micro apps

/**
 * What the four micro-app endpoints answer. `stored` is false when the entry was already there
 * (a retried send, or a second daily entry for the same day): the first one stands. `live` is
 * the same block as in GET /api/me, computed after the entry, so the page can show today's
 * price and its change at once.
 */
export interface MicroEntryResponse {
  stored: boolean;
  /** The day the entry is recorded for. */
  day: string;
  live: MeLive | null;
}

/**
 * POST /api/daily. The daily open: three taps. Needs the health consent
 * (health_consent_required) and a completed check (check_required). One entry per day; a
 * second one for the same day is not stored. `day` may be today or yesterday (day_closed
 * otherwise). No other field is accepted.
 */
export interface DailyEntryRequest {
  /** The device's local date today, YYYY-MM-DD. Checked against server time like a visit. */
  localDate: string;
  /** The day the entry describes. Defaults to localDate. Yesterday can be filled in today. */
  day?: string;
  /** Option index 0 to 4, or null when the tap was left out. At least one of the three is set. */
  sleep: number | null;
  exercise: number | null;
  state: number | null;
}

/**
 * POST /api/payday. BANDS ONLY, as paydayBandsFor of the engine returns them on the device.
 * The request may carry the fields of PAYDAY_ENTRY_FIELDS and nothing else: any other field,
 * and any value that is not a small whole number, is refused with amounts_not_accepted and
 * nothing is stored. Needs a completed check and eligibility (payday_not_eligible).
 */
export interface PaydayEntryRequest {
  /** Made up by the client (CLIENT_ID_PATTERN) so a retried send is stored once. */
  id: string;
  localDate: string;
  /** Pay periods behind the saving share: 0 without a share, otherwise 1 to averagePeriods. */
  periods: number;
  /** Option index of the saving-share question, or null. */
  saveShare: number | null;
  /** Option index of the months-of-savings question, or null. */
  runway: number | null;
  /** MeLive.apps.payday.baseline.day when a runway estimate was made from it, otherwise null. */
  baselineDay: string | null;
}

/**
 * POST /api/weekly-wins. A category and counts, no free text: the title stays on the device.
 * course: `hours` is an option index 0 to 4 or null. certificate: `exam` and `level` are
 * required. skill: nothing else. A field that does not belong to the kind is refused.
 */
export interface WeeklyWinRequest {
  id: string;
  localDate: string;
  kind: WeeklyWinKind;
  hours?: number | null;
  exam?: boolean;
  level?: CertificateLevel;
}

/**
 * POST /api/people-nudges. Counts only, no names. `reached` lists what each person reached is
 * to the user, one entry per person, at most as many as the app plans for a week.
 */
export interface PeopleNudgeRequest {
  id: string;
  localDate: string;
  /** People picked to reconnect with this week. */
  planned: number;
  reached: NudgeCategory[];
}

export const VERSION_KINDS = ['algo', 'bank', 'norm'] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

/** One change of version, from the version log. */
export interface VersionMarker {
  kind: VersionKind;
  /** The version that came into use, as text: "2" for algorithm 2. */
  version: string;
  /** The day it came into use. */
  day: string;
}

/**
 * GET /api/me/export. Every row the server holds about this user, as stored (column names in
 * snake_case). The hashes of the device tokens and of the recovery code are left out.
 */
export interface ExportResponse {
  exportedAt: string;
  /** What each table holds, in plain words. */
  about: Record<string, string>;
  user: Record<string, unknown>;
  tables: Record<string, Array<Record<string, unknown>>>;
}

/** POST /api/me/delete. Deletes every row of this user. It cannot be undone. */
export interface DeleteMeRequest {
  confirm: true;
}

export interface DeleteMeResponse {
  deleted: true;
  /** Rows removed from each table. */
  rows: Record<string, number>;
}

// ---------------------------------------------------------------- why it moved

/** One end of a breakdown: a completed check as the chart shows it. */
export interface BreakdownEnd {
  sessionId: string;
  at: string;
  versions: VersionSet;
  overall: number | null;
}

/**
 * GET /api/me/breakdown. The points each changed answer added to every sector price and to the
 * overall price between two completed checks of the caller. Without parameters: the latest
 * check against the one before it. `to=<session id>`: that check against the one before it.
 * `from` and `to`: those two checks. An id that is not a completed check of the caller fails
 * with not_found.
 *
 * In `breakdown`, the lines of each price add up to its `delta`. A line names a question id,
 * the option before and after, and its points; the app shows the question text from the bank.
 */
export interface BreakdownResponse {
  /** null when there is no earlier check to compare with. */
  from: BreakdownEnd | null;
  /** null when the caller has no completed check. */
  to: BreakdownEnd | null;
  /** null when either end is missing. */
  breakdown: Breakdown | null;
}

/** The prices of one day of the live series. */
export interface DayPrices {
  overall: number | null;
  overallTarget: number | null;
  sectors: Record<AreaId, { status: TimelineStatus; price: number | null; target: number | null }>;
}

/**
 * GET /api/me/breakdown/day. Why the price moved between two days of the live series.
 * Without parameters: the latest day on which the data gave another price than the day before,
 * against that day before. `day`: that day against the day before it. `from` and `day`: those
 * two days. `today` works as in GET /api/me.
 *
 * `breakdown` explains target prices, what the data of each day gives: its lines add up to the
 * change of `target` between the two days. The shown price can trail its target by the daily
 * limit or a halt; `prices` carries both for the two days.
 */
export interface DayBreakdownResponse {
  /** null when there is no such pair of days. */
  from: string | null;
  to: string | null;
  breakdown: Breakdown | null;
  prices: { from: DayPrices; to: DayPrices } | null;
}

// ---------------------------------------------------------------- report events and visits

export interface ReportEventInput {
  /** Id made up by the client (CLIENT_ID_PATTERN) so a retried send is stored once. */
  id: string;
  section: ReportSection;
  kind: ReportEventKind;
  /** dwell only: milliseconds in view, 0 to MAX_DWELL_MS. */
  ms?: number | null;
  /** useful only: true for "useful", false for "not useful". */
  useful?: boolean | null;
}

/** POST /api/report-events. `sessionId` is the check whose result page is on screen. */
export interface PostReportEventsRequest {
  sessionId: string;
  events: ReportEventInput[];
}

export interface PostReportEventsResponse {
  stored: number;
  duplicates: number;
}

/** POST /api/visits. One row per user per local day. Send once when the app opens. */
export interface VisitRequest {
  /** The device's local date, YYYY-MM-DD. */
  localDate: string;
}

export interface VisitResponse {
  day: string;
  /** False when today's visit was already recorded. */
  recorded: boolean;
}

// ---------------------------------------------------------------- friend compare

/**
 * One person in a comparison: what the share card shows and nothing else. No answers, no
 * history, no data grade, no background.
 */
export interface CompareSide {
  ticker: string | null;
  /** Overall price of the latest completed check. */
  overall: number | null;
  /** Price of each sector. null: no price (unlisted or not enough data). */
  sectors: Record<AreaId, number | null>;
  /** The two highest sectors. null when the sectors are too close or fewer than two are priced. */
  type: [AreaId, AreaId] | null;
}

/**
 * POST /api/compare/invites. Needs a completed check (otherwise check_required). The code is
 * returned once and stored only as a hash; the app builds the link from it. At most
 * `limit` unused invites per person (invite_limit).
 */
export interface CreateInviteResponse {
  /** Random, 128 bits, URL-safe. Put it in the invite link. Never shown again. */
  code: string;
  expiresAt: string;
}

export type InviteStatus = 'open' | 'accepted' | 'expired';

/**
 * POST /api/compare/invites/lookup. What the page behind an invite link shows before anyone
 * signs in. The code travels in the body, never in a URL of the API. An unknown code fails
 * with invite_invalid.
 */
export interface InviteLookupRequest {
  code: string;
}

export interface InviteLookupResponse {
  status: InviteStatus;
  expiresAt: string;
  /** Ticker of the person who sent the invite. */
  fromTicker: string | null;
  /** True when the caller sent a device token and made this invite. */
  own: boolean;
}

/**
 * POST /api/compare/accept. Needs a completed check of the caller (check_required). Fails
 * with invite_invalid for an unknown, used or expired code and with invite_own for the
 * caller's own invite. When the two people already have a comparison it is returned and the
 * invite is used up.
 */
export interface AcceptInviteRequest {
  code: string;
}

/** Two people side by side. Read from the latest completed check of each at the time of the call. */
export interface Comparison {
  id: string;
  createdAt: string;
  me: CompareSide;
  other: CompareSide;
}

export interface AcceptInviteResponse {
  comparison: Comparison;
  /** False when the two already had a comparison. */
  created: boolean;
}

/** GET /api/compare. Every comparison of the caller, newest first, and their unused invites. */
export interface ComparisonsResponse {
  comparisons: Comparison[];
  /** Invites that were not accepted and have not expired. The codes cannot be shown again. */
  openInvites: Array<{ createdAt: string; expiresAt: string }>;
}

/** GET /api/compare/:id. Someone else's comparison reads as not found. */
export interface ComparisonResponse {
  comparison: Comparison;
}

/** POST /api/compare/:id/delete. Either person can delete it; it is gone for both. */
export interface DeleteComparisonResponse {
  deleted: true;
}

// ---------------------------------------------------------------- team dashboard

/**
 * Part of every team response. Simulated people are made by the local demo data script
 * (npm run seed:demo) and never exist in production. Above 0, the numbers in the response
 * include simulated data and the page must say so.
 */
export interface TeamDemoMark {
  /** People flagged as simulated. Always 0 in production. */
  demoPeople: number;
}

/** A share with the counts it came from. The dashboard always shows the counts. */
export interface Rate {
  /** Numerator. */
  count: number;
  /** Denominator. */
  of: number;
  /** count / of. null when of is 0. */
  rate: number | null;
}

/** Red lines and reference values, straight from src/engine/config.ts. */
export interface TeamRedLines {
  skipRate: number;
  dropOffRate: number;
  timeVsSimilarStems: number;
  optionShareMax: number;
  optionShareMin: number;
  notApplicableRate: number;
  retestChangeRate: number;
}

export interface TeamGoCriteria {
  completionRate: number;
  maxItemSkipRate: number;
  retestCorrelation: number;
  dailyOpenDay7Return: number;
  dailyOpenDay30Return: number;
  paydayCompletionShare: number;
}

export interface TeamStartedCompleted {
  /** Checks started and completed. */
  sessions: Rate;
  /** People who started at least one check, and of those who completed at least one. */
  people: Rate;
}

/** GET /api/team/overview */
export interface TeamOverviewResponse extends TeamDemoMark {
  generatedAt: string;
  versions: VersionSet;
  /** Checks started by simulated people. Always 0 in production. */
  demoChecks: number;
  totals: TeamStartedCompleted;
  byRole: Array<TeamStartedCompleted & { role: RoleId }>;
  /**
   * Correlation of the overall price between two checks by the same person taken
   * retestWindowDays apart. One pair per person: their earliest such pair.
   */
  retest: { pairs: number; correlation: number | null; windowDays: { min: number; max: number } };
  /** What the team wants to see before the next stage, with the current value of each. */
  goCriteria: TeamGoCriteria;
  status: {
    completionRate: Rate & { met: boolean | null };
    /** Highest skip rate of any question version, over all roles. */
    maxItemSkipRate: { value: number | null; itemId: string | null; versionKey: string | null; met: boolean | null };
    retestCorrelation: { value: number | null; pairs: number; met: boolean | null };
  };
  redLines: TeamRedLines;
}

/** One question version on the per-question table. */
export interface TeamItemRow {
  itemId: string;
  versionKey: string;
  /** Section of the question: a sector, or G for the ladder. */
  area: string;
  /** Checks in which this version was shown. Denominator of skip and drop-off. */
  shown: number;
  /** Of those shown, skipped. Red above redLines.skipRate. */
  skip: Rate & { red: boolean };
  /**
   * Of those shown, left without answering it and nothing since (the check is unfinished and
   * has been idle for longer than dropOffIdleMinutes). Red above redLines.dropOffRate.
   */
  dropOff: Rate & { red: boolean };
  /** Checks that selected an option. Denominator of the option shares. */
  answered: number;
  time: {
    /** Median seconds to select an option. null without answers. */
    medianSeconds: number | null;
    /** Stem length in reading seconds: readUnits in the language most answers used, at the engine's glance speed. */
    stemSeconds: number;
    stemLang: Lang;
    /** Question versions with data and a stem of similar length (see similarStemBand). */
    similarCount: number;
    /** Median of their median seconds. null with fewer than minSimilarStems of them. */
    similarMedianSeconds: number | null;
    /** Median above redLines.timeVsSimilarStems times similarMedianSeconds. */
    red: boolean;
  };
  options: {
    /** Times each option was selected, by option index in bank order. */
    counts: number[];
    /** counts / answered. null entries when answered is 0. */
    shares: Array<number | null>;
    /** One share above redLines.optionShareMax, or any below redLines.optionShareMin. */
    red: boolean;
  };
  /**
   * Of those shown, checks that marked the question not applicable (`marked`) or selected an
   * option that is not scored (`unscoredOption`). count is the sum of the two, of is `shown`.
   * Red above redLines.notApplicableRate. `hasOption`: the version has an unscored option.
   */
  notApplicable: Rate & { red: boolean; hasOption: boolean; marked: number; unscoredOption: number };
  /**
   * People who selected an option of this version in two checks retestWindowDays apart, and how
   * many chose a different one the second time. Red above redLines.retestChangeRate.
   */
  retest: Rate & { red: boolean };
}

/** GET /api/team/items?role=<RoleId>&bank=<version> */
export interface TeamItemsResponse extends TeamDemoMark {
  generatedAt: string;
  bankVersion: string;
  /** null: all roles. */
  role: RoleId | null;
  redLines: TeamRedLines;
  /** How the table defines the things the brief leaves open. */
  definitions: {
    /** Stems within this ratio of each other in reading seconds count as similar. */
    similarStemBand: number;
    minSimilarStems: number;
    dropOffIdleMinutes: number;
    retestWindowDays: { min: number; max: number };
  };
  /** In bank order. Only versions that were shown at least once. */
  rows: TeamItemRow[];
}

/** A cohort: one role or all, one age band or all. */
export interface TeamCohort {
  /** null: all roles. */
  role: RoleId | null;
  /** Index into bank.ages. null: all ages. */
  age: number | null;
}

export interface TeamPriceRow extends TeamCohort {
  area: AreaId;
  /** People with a price in this sector (their latest completed check). */
  n: number;
  median: number;
  min: number;
  max: number;
  /** People per price band. bins[i] covers binEdges[i] up to binEdges[i + 1]; the last band includes its upper edge. */
  bins: number[];
}

/** GET /api/team/prices. Sector price distribution by role and age band. */
export interface TeamPricesResponse extends TeamDemoMark {
  generatedAt: string;
  versions: VersionSet;
  binEdges: number[];
  rows: TeamPriceRow[];
}

export interface TeamNormRow extends TeamCohort {
  area: AreaId;
  n: number;
  /** Median of the internal 0 to 1 sector values. This is what a real norm would use. */
  median: number;
  mean: number;
  /** Sample standard deviation (n - 1). null when n is below 2. */
  sd: number | null;
}

/**
 * GET /api/team/norms. Actual median, standard deviation and head count of the internal sector
 * values per cohort, next to the norm in force. The team reads this before it sets real norms.
 */
export interface TeamNormsResponse extends TeamDemoMark {
  generatedAt: string;
  versions: VersionSet;
  /** The norm results are computed with today. */
  current: { version: string; provisional: boolean; sectors: Record<AreaId, { median: number; sd: number }> };
  rows: TeamNormRow[];
}

export interface TeamReturnRow {
  /** Local date of the person's first completed check. "all" for the total row. */
  firstDay: string;
  people: number;
  /**
   * One entry per day in returnDays. `of`: people whose day N has fully passed. `count`: of
   * those, people with a visit on that day.
   */
  returns: Array<Rate & { day: number }>;
}

/** GET /api/team/returns. Return rates by the date of the first check. */
export interface TeamReturnsResponse extends TeamDemoMark {
  generatedAt: string;
  returnDays: number[];
  rows: TeamReturnRow[];
}

export interface TeamReportRow {
  section: ReportSection;
  /** Result pages (person and check) on which the section was seen. */
  seen: number;
  /** Median of the dwell events, in milliseconds. */
  medianDwellMs: number | null;
  dwellEvents: number;
  shares: number;
  /** Last "useful" click of each person and check. */
  useful: number;
  notUseful: number;
}

/** GET /api/team/report. How the result page is read, section by section. */
export interface TeamReportResponse extends TeamDemoMark {
  generatedAt: string;
  rows: TeamReportRow[];
}

// ---------------------------------------------------------------- team dashboard, stage 2

/**
 * An active person on a day: someone with a completed check on or before that day who opened
 * the app that day (a visit) or recorded an entry in a micro app that day.
 */
export interface TeamDailyRow {
  /** UTC date. "all" for the total row, which adds up person-days. */
  day: string;
  /** Active people that day. */
  active: number;
  /** `of`: active people with the health consent, who can use the daily open. `count`: those who recorded it that day. */
  dailyOpen: Rate;
}

/** GET /api/team/daily. Share of active people who did the daily open, day by day. */
export interface TeamDailyResponse extends TeamDemoMark {
  generatedAt: string;
  /** The table covers this many days up to today. */
  days: number;
  /** The total row first, then one row per day, oldest first. Days without an active person are left out. */
  rows: TeamDailyRow[];
}

export interface TeamAppRow {
  app: MicroApp;
  /** The stage switch of the app in this environment. */
  enabled: boolean;
  /** People count as active when they were active on one of the last `windowDays` days. */
  windowDays: number;
  /** Active people in the window. */
  active: number;
  /**
   * `of`: active people the app is offered to (daily open: with the health consent; payday:
   * living on own earnings in an eligible role; the weekly apps: everyone). `count`: those with
   * an entry in the window.
   */
  participated: Rate;
  /** Entries recorded in the window. */
  entries: number;
}

export interface TeamAppWeekRow {
  /** Monday of the calendar week. */
  weekStart: string;
  /** People active on at least one day of the week. */
  active: number;
  weeklyWin: Rate;
  peopleNudge: Rate;
}

/** GET /api/team/apps. Who uses the four micro apps. CSV: the weeks; `table=summary` gives the summary. */
export interface TeamAppsResponse extends TeamDemoMark {
  generatedAt: string;
  summary: TeamAppRow[];
  /** One row per calendar week with an active person, oldest first. */
  weeks: TeamAppWeekRow[];
}

export const TEAM_GATE_IDS = [
  'completion_rate',
  'max_item_skip_rate',
  'retest_correlation',
  'day7_return',
  'day30_return',
  'payday_share',
] as const;
export type TeamGateId = (typeof TEAM_GATE_IDS)[number];

/** One go or no-go gate: the value the team set, and the number the data gives today. */
export interface TeamGate {
  id: TeamGateId;
  /** The stage the gate closes: 1 for the check, 2 for the daily habit. */
  stage: 1 | 2;
  /** Where the gate is written down: the roadmap deck, or the appendix of the brief. */
  from: 'deck' | 'brief';
  /** The value from GO_CRITERIA in src/engine/config.ts. */
  criterion: number;
  /** at_least: met when value >= criterion. at_most: met when value <= criterion. */
  direction: 'at_least' | 'at_most';
  /** null without data. */
  value: number | null;
  /** The counts behind a share, when it is one. */
  count: number | null;
  of: number | null;
  /** null without data. */
  met: boolean | null;
  /** max_item_skip_rate: the question version with the highest skip rate, "id/version". */
  note: string | null;
}

/** GET /api/team/gates. The gates between stages next to the actual numbers. */
export interface TeamGatesResponse extends TeamDemoMark {
  generatedAt: string;
  gates: TeamGate[];
}

/** The results of the seven scoring tests of the engine (src/engine/evaluation.ts). */
export interface SevenTestResults {
  range: RangeTest;
  stability: StabilityTest;
  response: ResponseTest;
  validity: ValidityTest;
  fairness: FairnessTest;
  gaming: GamingTest;
  versionEffect: VersionEffectTest;
}

/**
 * GET /api/team/tests. The seven scoring tests over the stored checks: range, stability,
 * response, validity, fairness, gaming, version effect. Each has a verdict ("pass", "warn"
 * with the thresholds missed, or "insufficient_data"), the count behind it and its numbers.
 * The version effect uses results already stored under a second version; `npm run eval --
 * --algo N` computes it against any registered version.
 */
export interface TeamTestsResponse extends TeamDemoMark {
  generatedAt: string;
  versions: VersionSet;
  /** Completed checks with a stored result, and the people behind them. */
  checks: number;
  people: number;
  retestPairs: number;
  consecutivePairs: number;
  versionPairs: number;
  /** What the version effect compares, in words. null when there is nothing to compare. */
  versionComparison: string | null;
  /** The thresholds the verdicts use, straight from src/engine/config.ts. */
  thresholds: typeof EVALUATION;
  results: SevenTestResults;
}
