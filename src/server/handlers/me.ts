/**
 * The signed-in user's own data: the home page read, export, delete, report events and visits
 * (PROMPT.md sections 6, 7.1 and 11).
 */
import {
  CLIENT_ID_PATTERN,
  MAX_DWELL_MS,
  MAX_REPORT_EVENTS_PER_REQUEST,
  REPORT_EVENT_KINDS,
  REPORT_SECTIONS,
  type DeleteMeResponse,
  type ExportResponse,
  type HistoryPoint,
  type MeResponse,
  type PostReportEventsResponse,
  type VisitResponse,
} from '../../shared/api';
import { CURRENT, type Grade } from '../../engine';
import { consentOf, profileOf, requireUser } from '../auth';
import { first } from '../db';
import { invalid, isInt, isOneOf, isRecord, json, readBody, type Deps } from '../http';
import { latestOpenSession, loadSession, pricesOf, shownResults, storedResult, versionsOf } from '../sessions';
import { USERS_TABLE, USER_TABLES } from '../tables';
import { checkedLocalDay, overallChange } from './sessions';

/** GET /api/me */
export async function getMe(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const rows = await shownResults(deps.db, user.id, CURRENT);
  const history: HistoryPoint[] = rows.map((row) => ({
    sessionId: row.session_id,
    at: row.completed_at,
    overall: row.overall,
    sectors: pricesOf(row),
    grade: row.grade as Grade,
    versions: versionsOf(row),
  }));
  const priced = rows.map((r) => r.overall).filter((v): v is number => v !== null);
  const latestRow = rows.length > 0 ? rows[rows.length - 1] : null;

  const open = await latestOpenSession(deps.db, user.id);
  const answered = open
    ? await first<{ n: number }>(
        deps.db,
        `select count(*)::int as n from question_events where session_id = $1 and action <> 'shown'`,
        [open.id],
      )
    : null;

  const response: MeResponse = {
    user: profileOf(user),
    consent: consentOf(user),
    latest: latestRow ? await storedResult(deps.db, latestRow) : null,
    change: latestRow && rows.length > 1 ? overallChange(rows[rows.length - 2], latestRow.overall) : null,
    history,
    allTime: {
      high: priced.length > 0 ? Math.max(...priced) : null,
      low: priced.length > 0 ? Math.min(...priced) : null,
    },
    openSession: open ? { id: open.id, createdAt: open.created_at, answered: answered?.n ?? 0 } : null,
  };
  return json(response);
}

function without(row: Record<string, unknown>, hidden: readonly string[] | undefined): Record<string, unknown> {
  if (!hidden || hidden.length === 0) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.includes(key)));
}

/** GET /api/me/export */
export async function exportMe(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const userRow = await first<Record<string, unknown>>(deps.db, `select * from ${USERS_TABLE.name} where id = $1`, [
    user.id,
  ]);
  const tables: ExportResponse['tables'] = {};
  const about: ExportResponse['about'] = { [USERS_TABLE.name]: USERS_TABLE.about };
  // Table names and order columns come from the fixed list in tables.ts, never from the request.
  for (const table of USER_TABLES) {
    const rows = await deps.db.query<Record<string, unknown>>(
      `select * from ${table.name} where user_id = $1 order by ${table.orderBy}`,
      [user.id],
    );
    tables[table.name] = rows.map((row) => without(row, table.hidden));
    about[table.name] = table.about;
  }
  const response: ExportResponse = {
    exportedAt: deps.now().toISOString(),
    about,
    user: without(userRow ?? {}, USERS_TABLE.hidden),
    tables,
  };
  return json(response);
}

/** POST /api/me/delete. Removes every row of the user, in one transaction. */
export async function deleteMe(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);
  if (body.confirm !== true) throw invalid('confirm must be true');
  const rows: Record<string, number> = {};
  await deps.db.transaction(async (tx) => {
    for (const table of USER_TABLES) {
      const gone = await tx.query(`delete from ${table.name} where user_id = $1 returning 1 as x`, [user.id]);
      rows[table.name] = gone.length;
    }
    const gone = await tx.query(`delete from ${USERS_TABLE.name} where id = $1 returning 1 as x`, [user.id]);
    rows[USERS_TABLE.name] = gone.length;
  });
  const response: DeleteMeResponse = { deleted: true, rows };
  return json(response);
}

/** POST /api/report-events. These rows are for improving the report and never enter scoring. */
export async function postReportEvents(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);
  if (typeof body.sessionId !== 'string') throw invalid('sessionId is required');
  if (!Array.isArray(body.events) || body.events.length === 0) throw invalid('events must be a non-empty array');
  if (body.events.length > MAX_REPORT_EVENTS_PER_REQUEST) {
    throw invalid(`at most ${MAX_REPORT_EVENTS_PER_REQUEST} events per request`);
  }
  const rows = body.events.map((raw: unknown, index: number) => {
    if (!isRecord(raw)) throw invalid('an event must be an object', { index });
    if (typeof raw.id !== 'string' || !CLIENT_ID_PATTERN.test(raw.id)) {
      throw invalid('event id must be 16 to 64 URL-safe characters', { index });
    }
    if (!isOneOf(raw.section, REPORT_SECTIONS)) throw invalid('unknown section', { index });
    if (!isOneOf(raw.kind, REPORT_EVENT_KINDS)) throw invalid('unknown kind', { index });
    let ms: number | null = null;
    let useful: boolean | null = null;
    if (raw.kind === 'dwell') {
      if (!isInt(raw.ms, 0, MAX_DWELL_MS)) throw invalid(`ms must be a whole number from 0 to ${MAX_DWELL_MS}`, { index });
      ms = raw.ms;
    } else if (raw.kind === 'useful') {
      if (typeof raw.useful !== 'boolean') throw invalid('useful must be true or false', { index });
      useful = raw.useful;
    }
    return { id: raw.id, section: raw.section, kind: raw.kind, ms, useful };
  });
  const session = await loadSession(deps.db, user.id, body.sessionId);

  const inserted = await deps.db.query(
    `insert into report_events (user_id, id, session_id, section, kind, ms, useful, at)
     select $1, x.id, $2, x.section, x.kind, x.ms, x.useful, $3
     from jsonb_to_recordset($4::jsonb) as x(id text, section text, kind text, ms integer, useful boolean)
     on conflict do nothing
     returning id`,
    [user.id, session.id, deps.now().toISOString(), JSON.stringify(rows)],
  );
  const response: PostReportEventsResponse = { stored: inserted.length, duplicates: rows.length - inserted.length };
  return json(response);
}

/** POST /api/visits. One row per user per local day. */
export async function postVisit(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);
  if (body.localDate === undefined || body.localDate === null) throw invalid('localDate is required');
  const now = deps.now();
  const day = checkedLocalDay(body.localDate, now);
  const inserted = await deps.db.query(
    'insert into visits (user_id, day, first_at) values ($1, $2, $3) on conflict do nothing returning day',
    [user.id, day, now.toISOString()],
  );
  const response: VisitResponse = { day, recorded: inserted.length > 0 };
  return json(response);
}
