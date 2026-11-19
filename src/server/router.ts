/**
 * The API router. app/api/[[...path]]/route.ts hands every /api request to handleApi.
 *
 * createApi takes its dependencies (database, environment, clock) as arguments, so the whole
 * API can be exercised in tests with an in-memory database and a fixed clock. handleApi wires
 * the real ones.
 *
 * Privacy: the router reads the method, the path, the query string and the Authorization
 * header. It never reads, stores or logs an IP address or a user agent. The one third party it
 * can reach is PostHog, only when POSTHOG_KEY is set, only after the response, and only with
 * the funnel events described in ./posthog.ts.
 *
 * Stage 2 adds the four micro-app endpoints (./handlers/micro.ts), each behind its switch from
 * the environment, the live series in GET /api/me (./live.ts), and four team tables.
 */
import {
  CONSENT_VERSIONS,
  type ConfigResponse,
  type HealthResponse,
} from '../shared/api';
import { BANKS, CURRENT, EngineError, ROLE_IDS, type RoleId } from '../engine';
import { requireTeam } from './auth';
import { first } from './db';
import { getDb } from './db/index';
import { readEnv } from './env';
import { createUser, restore, rotateRecovery, setConsent, signOut } from './handlers/accounts';
import {
  acceptInvite,
  createInvite,
  deleteComparison,
  getComparison,
  listComparisons,
  lookupInvite,
} from './handlers/compare';
import { deleteMe, exportMe, getMe, postReportEvents, postVisit } from './handlers/me';
import { completeSession, createSession, getOpenSession, getSession, postEvents } from './handlers/sessions';
import { getBreakdown, getDayBreakdown } from './handlers/breakdown';
import { postDaily, postPayday, postPeopleNudge, postWeeklyWin } from './handlers/micro';
import { ApiError, errorResponse, invalid, isOneOf, json, type Deps } from './http';
import { forwarderFor, type FunnelEvent } from './posthog';
import { teamReport, teamReportCsv, teamReturns, teamReturnsCsv } from './team/activity';
import { teamApps, teamAppsCsv, teamDaily, teamDailyCsv } from './team/apps';
import { teamGates, teamGatesCsv } from './team/gates';
import { teamTests, teamTestsCsv } from './team/tests';
import { teamNorms, teamNormsCsv, teamPrices, teamPricesCsv } from './team/cohorts';
import { teamItems, teamItemsCsv } from './team/items';
import { teamOverview, teamOverviewCsv } from './team/overview';

export type { Deps } from './http';

async function health(deps: Deps): Promise<Response> {
  const row = await first<{ ok: number }>(deps.db, 'select 1::int as ok');
  const response: HealthResponse = { ok: row?.ok === 1, environment: deps.env.environment };
  return json(response);
}

function config(deps: Deps): Response {
  const response: ConfigResponse = {
    environment: deps.env.environment,
    flags: { ...deps.env.flags },
    versions: { ...CURRENT },
    consentVersions: { ...CONSENT_VERSIONS },
    teamOpen: deps.env.adminPassphrase !== null,
  };
  return json(response);
}

/** Header of a team CSV: the number of simulated people behind it. 0 in production. */
export const DEMO_HEADER = 'x-standing-demo-people';

/** /api/team/*: read only, aggregates only. Every table is also served as CSV. */
async function team(request: Request, deps: Deps, name: string, url: URL): Promise<Response> {
  await requireTeam(request, deps);
  const format = url.searchParams.get('format');
  if (format !== null && format !== 'json' && format !== 'csv') throw invalid('format must be json or csv');
  const asCsv = format === 'csv';
  const now = deps.now();
  // A CSV has no place for the demo mark of the JSON body, so it travels as a header.
  const marked = (data: { demoPeople: number }, response: Response): Response => {
    response.headers.set(DEMO_HEADER, String(data.demoPeople));
    return response;
  };
  switch (name) {
    case 'overview': {
      const data = await teamOverview(deps.db, now);
      return asCsv ? marked(data, teamOverviewCsv(data, url.searchParams.get('table'))) : json(data);
    }
    case 'items': {
      const roleParam = url.searchParams.get('role');
      let role: RoleId | null = null;
      if (roleParam !== null && roleParam !== '' && roleParam !== 'all') {
        if (!isOneOf(roleParam, ROLE_IDS)) throw invalid('role is not a known role');
        role = roleParam;
      }
      const bank = url.searchParams.get('bank') ?? CURRENT.bank;
      if (!Object.hasOwn(BANKS, bank)) throw invalid('bank is not a registered bank version');
      const data = await teamItems(deps.db, now, role, bank);
      return asCsv ? marked(data, teamItemsCsv(data)) : json(data);
    }
    case 'prices': {
      const data = await teamPrices(deps.db, now);
      return asCsv ? marked(data, teamPricesCsv(data)) : json(data);
    }
    case 'norms': {
      const data = await teamNorms(deps.db, now);
      return asCsv ? marked(data, teamNormsCsv(data)) : json(data);
    }
    case 'returns': {
      const data = await teamReturns(deps.db, now);
      return asCsv ? marked(data, teamReturnsCsv(data)) : json(data);
    }
    case 'report': {
      const data = await teamReport(deps.db, now);
      return asCsv ? marked(data, teamReportCsv(data)) : json(data);
    }
    case 'daily': {
      const data = await teamDaily(deps.db, now);
      return asCsv ? marked(data, teamDailyCsv(data)) : json(data);
    }
    case 'apps': {
      const data = await teamApps(deps.db, now, deps.env.flags);
      return asCsv ? marked(data, teamAppsCsv(data, url.searchParams.get('table'))) : json(data);
    }
    case 'gates': {
      const data = await teamGates(deps.db, now, deps.env.flags);
      return asCsv ? marked(data, teamGatesCsv(data)) : json(data);
    }
    case 'tests': {
      const data = await teamTests(deps.db, now);
      return asCsv ? marked(data, teamTestsCsv(data)) : json(data);
    }
    default:
      throw new ApiError(404, 'not_found', 'no such team table');
  }
}

type Handler = (request: Request, deps: Deps) => Promise<Response> | Response;

/** Fixed paths. The key is "METHOD /path". */
const ROUTES: Record<string, Handler> = {
  'GET /api/health': (_request, deps) => health(deps),
  'GET /api/config': (_request, deps) => config(deps),
  'POST /api/users': createUser,
  'POST /api/restore': restore,
  'POST /api/recovery/rotate': rotateRecovery,
  'POST /api/signout': signOut,
  'POST /api/consent': setConsent,
  'GET /api/me': getMe,
  'GET /api/me/export': exportMe,
  'POST /api/me/delete': deleteMe,
  'GET /api/me/breakdown': getBreakdown,
  'GET /api/me/breakdown/day': getDayBreakdown,
  'POST /api/daily': postDaily,
  'POST /api/payday': postPayday,
  'POST /api/weekly-wins': postWeeklyWin,
  'POST /api/people-nudges': postPeopleNudge,
  'POST /api/sessions': createSession,
  'GET /api/sessions/open': getOpenSession,
  'POST /api/report-events': postReportEvents,
  'POST /api/visits': postVisit,
  'POST /api/compare/invites': createInvite,
  'POST /api/compare/invites/lookup': lookupInvite,
  'POST /api/compare/accept': acceptInvite,
  'GET /api/compare': listComparisons,
};

const KNOWN_PATHS = new Set(Object.keys(ROUTES).map((key) => key.split(' ')[1]));

async function route(request: Request, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const method = request.method.toUpperCase();

  const fixed = ROUTES[`${method} ${path}`];
  if (fixed) return fixed(request, deps);

  const parts = path.split('/').filter(Boolean);
  // /api/team/<table>
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'team') {
    if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'the team API is read only');
    return team(request, deps, parts[2], url);
  }
  // /api/sessions/<id>, /api/sessions/<id>/events, /api/sessions/<id>/complete
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'sessions') {
    const id = parts[2];
    if (parts.length === 3 && method === 'GET') return getSession(request, deps, id);
    if (parts.length === 4 && parts[3] === 'events' && method === 'POST') return postEvents(request, deps, id);
    if (parts.length === 4 && parts[3] === 'complete' && method === 'POST') return completeSession(request, deps, id);
    if (parts.length === 3 || (parts.length === 4 && (parts[3] === 'events' || parts[3] === 'complete'))) {
      throw new ApiError(405, 'method_not_allowed', 'this path does not take this method');
    }
  }
  if (KNOWN_PATHS.has(path)) throw new ApiError(405, 'method_not_allowed', 'this path does not take this method');
  // /api/compare/<id>, /api/compare/<id>/delete
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'compare') {
    const id = parts[2];
    if (parts.length === 3 && method === 'GET') return getComparison(request, deps, id);
    if (parts.length === 4 && parts[3] === 'delete' && method === 'POST') return deleteComparison(request, deps, id);
    if (parts.length === 3 || (parts.length === 4 && parts[3] === 'delete')) {
      throw new ApiError(405, 'method_not_allowed', 'this path does not take this method');
    }
  }
  throw new ApiError(404, 'not_found', 'no such endpoint');
}

/** Builds the API over the given dependencies. The returned function never throws. */
export function createApi(deps: Deps): (request: Request) => Promise<Response> {
  return async (request) => {
    // Funnel events are collected per request and handed over once, after the handler is done
    // and only when it succeeded. Without a forwarder nothing is collected.
    const noted: FunnelEvent[] = [];
    const scoped: Deps = deps.forward ? { ...deps, track: (event) => void noted.push(event) } : deps;
    try {
      const response = await route(request, scoped);
      if (deps.forward && noted.length > 0 && response.ok) {
        try {
          deps.forward(noted);
        } catch {
          // Forwarding is best effort. The response goes out either way.
        }
      }
      return response;
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      // Input the engine cannot score. Stored events are validated on the way in, so this
      // points at a bug or at a bank version that was edited after it produced data.
      if (error instanceof EngineError) {
        return errorResponse(new ApiError(500, 'internal_error', `engine: ${error.message}`));
      }
      // Log the error itself and nothing about the caller.
      console.error('[api] unhandled error', error);
      return errorResponse(new ApiError(500, 'internal_error', 'unexpected server error'));
    }
  };
}

/**
 * Runs a task once the response was sent. In a Next.js route handler that is after() of
 * next/server, which also keeps a serverless function alive until the task is done. Anywhere
 * else the task starts at once and is not awaited.
 */
async function deferrer(): Promise<(task: () => Promise<void>) => void> {
  const fireAndForget = (task: () => Promise<void>) => void task().catch(() => undefined);
  try {
    const { after } = await import('next/server');
    return (task) => {
      try {
        after(task);
      } catch {
        fireAndForget(task);
      }
    };
  } catch {
    return fireAndForget;
  }
}

/** Entry point for every /api request in the running app. */
export async function handleApi(request: Request): Promise<Response> {
  const env = readEnv();
  try {
    const db = await getDb(env);
    // Only with a PostHog key is anything loaded or scheduled for forwarding.
    const forward = env.posthog.key ? forwarderFor(env, await deferrer()) : undefined;
    return await createApi({ db, env, now: () => new Date(), forward })(request);
  } catch (error) {
    console.error('[api] cannot open the database', error);
    return errorResponse(new ApiError(500, 'internal_error', 'the database is not available'));
  }
}
