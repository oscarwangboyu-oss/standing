/**
 * A small typed client for the API in ./api.ts. Plain fetch, no dependencies, no storage: the
 * caller supplies the device token (src/client keeps it on the device).
 *
 *   const api = createClient({ getToken: () => store.deviceToken });
 *   const me = await api.me();
 *
 * A failed call throws ApiRequestError with the status and the error code of the server.
 * A network failure throws ApiRequestError with status 0 and code "network".
 */
import {
  API_BASE,
  clampSeconds,
  type AcceptInviteRequest,
  type AcceptInviteResponse,
  type ApiErrorBody,
  type ApiErrorCode,
  type BreakdownResponse,
  type ComparisonResponse,
  type ComparisonsResponse,
  type CompleteSessionResponse,
  type ConfigResponse,
  type ConsentRequest,
  type ConsentResponse,
  type CreateSessionRequest,
  type CreateInviteResponse,
  type CreateSessionResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type DailyEntryRequest,
  type DayBreakdownResponse,
  type DeleteComparisonResponse,
  type DeleteMeRequest,
  type DeleteMeResponse,
  type ExportResponse,
  type HealthResponse,
  type InviteLookupRequest,
  type InviteLookupResponse,
  type MeResponse,
  type MicroEntryResponse,
  type OkResponse,
  type PaydayEntryRequest,
  type PeopleNudgeRequest,
  type OpenSessionResponse,
  type PostEventsRequest,
  type PostEventsResponse,
  type PostReportEventsRequest,
  type PostReportEventsResponse,
  type QuestionEventInput,
  type ReportEventInput,
  type RestoreRequest,
  type RestoreResponse,
  type RotateRecoveryResponse,
  type SessionResponse,
  type TeamAppsResponse,
  type TeamDailyResponse,
  type TeamGatesResponse,
  type TeamItemsResponse,
  type TeamNormsResponse,
  type TeamOverviewResponse,
  type TeamPricesResponse,
  type TeamReportResponse,
  type TeamReturnsResponse,
  type TeamTestsResponse,
  type VisitRequest,
  type VisitResponse,
  type WeeklyWinRequest,
} from './api';
import type { RoleId } from '../engine';

export class ApiRequestError extends Error {
  constructor(
    /** HTTP status. 0 when the request never reached the server. */
    readonly status: number,
    readonly code: ApiErrorCode | 'network' | 'bad_response',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** True when sending the same request again later can succeed (offline, server error). */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

export interface ClientOptions {
  /** Prefix of the API. Defaults to "/api" on the same origin. */
  baseUrl?: string;
  /** Returns the bearer token to send, or null for none. Called on every request. */
  getToken?: () => string | null | undefined;
  /** Replacement for the global fetch, for tests. */
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST';

function createCaller(options: ClientOptions) {
  const base = options.baseUrl ?? API_BASE;
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function send(method: Method, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    const token = options.getToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch (error) {
      throw new ApiRequestError(0, 'network', error instanceof Error ? error.message : 'network error');
    }
    if (response.ok) return response;
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    if (parsed?.error?.code) {
      throw new ApiRequestError(response.status, parsed.error.code, parsed.error.message, parsed.error.details);
    }
    throw new ApiRequestError(response.status, 'bad_response', `HTTP ${response.status}`);
  }

  async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiRequestError(response.status, 'bad_response', 'the server did not answer with JSON');
    }
  }

  async function text(path: string): Promise<string> {
    return (await send('GET', path)).text();
  }

  return { call, text };
}

/** The client the app uses. Every method maps to one endpoint of ./api.ts. */
export function createClient(options: ClientOptions = {}) {
  const { call } = createCaller(options);
  const session = (id: string) => `/sessions/${encodeURIComponent(id)}`;
  return {
    health: () => call<HealthResponse>('GET', '/health'),
    config: () => call<ConfigResponse>('GET', '/config'),

    /** The first save. Keep deviceToken and recoveryCode from the answer: they are not shown again. */
    createUser: (body: CreateUserRequest) => call<CreateUserResponse>('POST', '/users', body),
    restore: (body: RestoreRequest) => call<RestoreResponse>('POST', '/restore', body),
    rotateRecovery: () => call<RotateRecoveryResponse>('POST', '/recovery/rotate', {}),
    signOut: () => call<OkResponse>('POST', '/signout', {}),
    setConsent: (body: ConsentRequest) => call<ConsentResponse>('POST', '/consent', body),

    /**
     * The home page read. Pass the device's local date (localDateOf) so the live series ends on
     * the person's own today; without it the server uses its UTC date.
     */
    me: (today?: string) => call<MeResponse>('GET', `/me${today ? `?today=${encodeURIComponent(today)}` : ''}`),
    exportData: () => call<ExportResponse>('GET', '/me/export'),
    deleteData: () => call<DeleteMeResponse>('POST', '/me/delete', { confirm: true } satisfies DeleteMeRequest),
    /**
     * Why a price moved. No argument: the latest check against the one before it. `to`: that
     * check against the one before it. `from` and `to`: those two checks.
     */
    breakdown: (params: { from?: string; to?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      const query = search.toString();
      return call<BreakdownResponse>('GET', `/me/breakdown${query ? `?${query}` : ''}`);
    },

    /**
     * Why the live price moved between two days. No `day`: the latest day the data gave another
     * price, against the day before. `day`: that day against the day before. `from` and `day`:
     * those two days.
     */
    dayBreakdown: (params: { day?: string; from?: string; today?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.day) search.set('day', params.day);
      if (params.from) search.set('from', params.from);
      if (params.today) search.set('today', params.today);
      const query = search.toString();
      return call<DayBreakdownResponse>('GET', `/me/breakdown/day${query ? `?${query}` : ''}`);
    },

    /** The daily open: three taps for today, or for yesterday with `day`. One entry per day. */
    postDaily: (body: DailyEntryRequest) => call<MicroEntryResponse>('POST', '/daily', body),
    /** The payday check. Bands only (paydayBandsFor of the engine): amounts never leave the device. */
    postPayday: (body: PaydayEntryRequest) => call<MicroEntryResponse>('POST', '/payday', body),
    /** A weekly win: a kind and, for a course, a band of hours. No title. */
    postWeeklyWin: (body: WeeklyWinRequest) => call<MicroEntryResponse>('POST', '/weekly-wins', body),
    /** A people nudge: how many were planned and the category of each person reached. No names. */
    postPeopleNudge: (body: PeopleNudgeRequest) => call<MicroEntryResponse>('POST', '/people-nudges', body),

    createSession: (body: CreateSessionRequest) => call<CreateSessionResponse>('POST', '/sessions', body),
    openSession: () => call<OpenSessionResponse>('GET', '/sessions/open'),
    getSession: (id: string) => call<SessionResponse>('GET', session(id)),
    /** Sends question events. Answer times are capped to the range the server accepts. */
    postEvents: (id: string, events: QuestionEventInput[]) =>
      call<PostEventsResponse>('POST', `${session(id)}/events`, {
        events: events.map((e) => (e.seconds === null ? e : { ...e, seconds: clampSeconds(e.seconds) })),
      } satisfies PostEventsRequest),
    completeSession: (id: string) => call<CompleteSessionResponse>('POST', `${session(id)}/complete`, {}),

    postReportEvents: (sessionId: string, events: ReportEventInput[]) =>
      call<PostReportEventsResponse>('POST', '/report-events', { sessionId, events } satisfies PostReportEventsRequest),
    visit: (localDate: string) => call<VisitResponse>('POST', '/visits', { localDate } satisfies VisitRequest),

    /** Makes a compare invite. Build the link from `code`: it is not shown again. */
    createInvite: () => call<CreateInviteResponse>('POST', '/compare/invites', {}),
    /** What an invite link leads to. Works without a device token. */
    lookupInvite: (code: string) =>
      call<InviteLookupResponse>('POST', '/compare/invites/lookup', { code } satisfies InviteLookupRequest),
    acceptInvite: (code: string) =>
      call<AcceptInviteResponse>('POST', '/compare/accept', { code } satisfies AcceptInviteRequest),
    comparisons: () => call<ComparisonsResponse>('GET', '/compare'),
    comparison: (id: string) => call<ComparisonResponse>('GET', `/compare/${encodeURIComponent(id)}`),
    deleteComparison: (id: string) =>
      call<DeleteComparisonResponse>('POST', `/compare/${encodeURIComponent(id)}/delete`, {}),
  };
}

export type StandingClient = ReturnType<typeof createClient>;

export type TeamTable = 'overview' | 'items' | 'prices' | 'norms' | 'returns' | 'report' | 'daily' | 'apps' | 'gates' | 'tests';

/**
 * The client of the team dashboard. `getToken` returns the team passphrase, which the page
 * keeps in memory only. The passphrase travels in the Authorization header, never in a URL.
 */
export function createTeamClient(options: ClientOptions = {}) {
  const { call, text } = createCaller(options);
  const query = (params: Record<string, string | null | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const s = search.toString();
    return s ? `?${s}` : '';
  };
  return {
    overview: () => call<TeamOverviewResponse>('GET', '/team/overview'),
    items: (role?: RoleId | null) => call<TeamItemsResponse>('GET', `/team/items${query({ role })}`),
    prices: () => call<TeamPricesResponse>('GET', '/team/prices'),
    norms: () => call<TeamNormsResponse>('GET', '/team/norms'),
    returns: () => call<TeamReturnsResponse>('GET', '/team/returns'),
    report: () => call<TeamReportResponse>('GET', '/team/report'),
    /** Share of active people who did the daily open, day by day. */
    daily: () => call<TeamDailyResponse>('GET', '/team/daily'),
    /** Use of the four micro apps: a summary per app, and the weekly apps week by week. */
    apps: () => call<TeamAppsResponse>('GET', '/team/apps'),
    /** The go or no-go gates next to the actual numbers. */
    gates: () => call<TeamGatesResponse>('GET', '/team/gates'),
    /** The seven scoring tests over the stored checks. */
    tests: () => call<TeamTestsResponse>('GET', '/team/tests'),
    /**
     * The CSV text of a table. `role` applies to "items"; `table: "status"` asks the overview
     * for the go criteria in place of the started and completed table; `table: "summary"` asks
     * "apps" for the per-app summary in place of the weeks.
     */
    csv: (table: TeamTable, params: { role?: RoleId | null; table?: 'status' | 'summary' } = {}) =>
      text(`/team/${table}${query({ format: 'csv', role: params.role, table: params.table })}`),
  };
}

export type StandingTeamClient = ReturnType<typeof createTeamClient>;

/** The device's local date, YYYY-MM-DD, for visits and session creation. */
export function localDateOf(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
