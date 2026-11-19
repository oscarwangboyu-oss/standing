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
  type ApiErrorBody,
  type ApiErrorCode,
  type CompleteSessionResponse,
  type ConfigResponse,
  type ConsentRequest,
  type ConsentResponse,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type DeleteMeRequest,
  type DeleteMeResponse,
  type ExportResponse,
  type HealthResponse,
  type MeResponse,
  type OkResponse,
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
  type TeamItemsResponse,
  type TeamNormsResponse,
  type TeamOverviewResponse,
  type TeamPricesResponse,
  type TeamReportResponse,
  type TeamReturnsResponse,
  type VisitRequest,
  type VisitResponse,
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

    me: () => call<MeResponse>('GET', '/me'),
    exportData: () => call<ExportResponse>('GET', '/me/export'),
    deleteData: () => call<DeleteMeResponse>('POST', '/me/delete', { confirm: true } satisfies DeleteMeRequest),

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
  };
}

export type StandingClient = ReturnType<typeof createClient>;

export type TeamTable = 'overview' | 'items' | 'prices' | 'norms' | 'returns' | 'report';

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
    /**
     * The CSV text of a table. `role` applies to "items"; `table: "status"` asks the overview
     * for the go criteria in place of the started and completed table.
     */
    csv: (table: TeamTable, params: { role?: RoleId | null; table?: 'status' } = {}) =>
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
