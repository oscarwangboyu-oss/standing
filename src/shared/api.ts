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
 *   GET    /api/me                       -                          MeResponse              (auth)
 *   GET    /api/me/export                -                          ExportResponse          (auth)
 *   POST   /api/me/delete                DeleteMeRequest            DeleteMeResponse        (auth)
 *   POST   /api/sessions                 CreateSessionRequest       CreateSessionResponse   (auth)
 *   GET    /api/sessions/open            -                          OpenSessionResponse     (auth)
 *   GET    /api/sessions/:id             -                          SessionResponse         (auth)
 *   POST   /api/sessions/:id/events      PostEventsRequest          PostEventsResponse      (auth)
 *   POST   /api/sessions/:id/complete    -                          CompleteSessionResponse (auth)
 *   POST   /api/report-events            PostReportEventsRequest    PostReportEventsResponse (auth)
 *   POST   /api/visits                   VisitRequest               VisitResponse           (auth)
 *   GET    /api/team/overview            -                          TeamOverviewResponse    (team)
 *   GET    /api/team/items?role=         -                          TeamItemsResponse       (team)
 *   GET    /api/team/prices              -                          TeamPricesResponse      (team)
 *   GET    /api/team/norms               -                          TeamNormsResponse       (team)
 *   GET    /api/team/returns             -                          TeamReturnsResponse     (team)
 *   GET    /api/team/report              -                          TeamReportResponse      (team)
 *
 * Every /api/team table is also served as CSV with `?format=csv`.
 */

import type {
  AreaId,
  Background,
  Grade,
  Lang,
  OrderDirection,
  Result,
  RoleId,
  Step,
  VersionSet,
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

export const EVENT_ACTIONS = ['shown', 'select', 'skip'] as const;
/** shown: the question appeared. select: an option was tapped. skip: the skip link was tapped. */
export type EventAction = (typeof EVENT_ACTIONS)[number];

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
  /** Answered and skipped questions in order, rebuilt from the stored events. */
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
 * One question event. Two are sent per question: "shown" when it appears, then "select" or
 * "skip". They are sent as they happen, never batched at the end, so the team can see where
 * people leave.
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
   * select and skip: seconds from display to tap, 0 to MAX_ANSWER_SECONDS (use clampSeconds).
   * skip may send null. shown: null.
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
  /** Questions answered or skipped so far. */
  answered: number;
  /** True when every question on the path has an answer or a skip: call complete next. */
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

// ---------------------------------------------------------------- team dashboard

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
export interface TeamOverviewResponse {
  generatedAt: string;
  versions: VersionSet;
  /** People flagged as simulated demo data. Always 0 in production. */
  demoPeople: number;
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
  /** Selections of an option that is not scored (score null). Red above redLines.notApplicableRate. */
  notApplicable: Rate & { red: boolean; hasOption: boolean };
  /**
   * People who selected an option of this version in two checks retestWindowDays apart, and how
   * many chose a different one the second time. Red above redLines.retestChangeRate.
   */
  retest: Rate & { red: boolean };
}

/** GET /api/team/items?role=<RoleId>&bank=<version> */
export interface TeamItemsResponse {
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
export interface TeamPricesResponse {
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
export interface TeamNormsResponse {
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
export interface TeamReturnsResponse {
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
export interface TeamReportResponse {
  generatedAt: string;
  rows: TeamReportRow[];
}
