/**
 * Reading sessions, events and results. Shared by the session handlers and by /api/me.
 * The steps of a session are never stored: they are rebuilt from the raw events every time.
 */
import { HEALTH_AREAS, type SessionInfo, type StoredResult, type UsState } from '../shared/api';
import type { AreaId, Background, Lang, OrderDirection, Result, RoleId, Step, VersionSet, Where } from '../engine';
import type { Db } from './db';
import { first } from './db';
import { ApiError } from './http';

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  completed_at: string | null;
  local_day: string;
  age: number;
  role: RoleId;
  extra: Record<string, number>;
  us_state: UsState | null;
  ticker: string | null;
  lang: Lang;
  bank_version: string;
  health_consent: boolean;
}

export interface EventRow {
  seq: number;
  action: 'shown' | 'select' | 'skip';
  item_id: string;
  version_key: string;
  lang: Lang;
  option_index: number | null;
  seconds: number | null;
  display_direction: OrderDirection;
  click_position: Where | null;
}

const SESSION_COLUMNS = `id, user_id, created_at, completed_at, local_day, age, role, extra, us_state, ticker,
  lang, bank_version, health_consent`;

/** The session, if it belongs to this user. Someone else's session reads as not found. */
export async function loadSession(db: Db, userId: string, sessionId: string): Promise<SessionRow> {
  const row = await first<SessionRow>(db, `select ${SESSION_COLUMNS} from sessions where id = $1 and user_id = $2`, [
    sessionId,
    userId,
  ]);
  if (!row) throw new ApiError(404, 'not_found', 'no such session');
  return row;
}

export async function latestOpenSession(db: Db, userId: string): Promise<SessionRow | null> {
  return first<SessionRow>(
    db,
    `select ${SESSION_COLUMNS} from sessions where user_id = $1 and completed_at is null
     order by created_at desc, id desc limit 1`,
    [userId],
  );
}

/** All events of a session in order. At most two rows per question, so under 70 rows. */
export async function loadEvents(db: Db, sessionId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `select seq, action, item_id, version_key, lang, option_index, seconds, display_direction, click_position
     from question_events where session_id = $1
     order by seq, case action when 'shown' then 0 else 1 end`,
    [sessionId],
  );
}

export function backgroundOf(session: SessionRow): Background {
  return { age: session.age, role: session.role, extra: session.extra };
}

/** Sectors left out of the check: body and mind when the health consent is absent. */
export function excludedAreasOf(session: Pick<SessionRow, 'health_consent'>): AreaId[] {
  return session.health_consent ? [] : [...HEALTH_AREAS];
}

export function sessionInfo(session: SessionRow): SessionInfo {
  return {
    id: session.id,
    createdAt: session.created_at,
    completedAt: session.completed_at,
    background: backgroundOf(session),
    usState: session.us_state,
    ticker: session.ticker,
    lang: session.lang,
    bankVersion: session.bank_version,
    healthConsent: session.health_consent,
    excludedAreas: excludedAreasOf(session),
  };
}

/** The engine step of one answer event (select or skip). */
export function stepOf(event: EventRow): Step {
  const step: Step = {
    id: event.item_id,
    key: event.version_key,
    k: event.action === 'select' ? event.option_index : null,
    secs: event.seconds,
    lang: event.lang,
    order: event.display_direction,
    source: 'questionnaire',
  };
  if (event.click_position) step.where = event.click_position;
  return step;
}

/** Answered and skipped questions in order. "shown" events carry no answer and are left out. */
export function stepsOf(events: readonly EventRow[]): Step[] {
  return events.filter((e) => e.action !== 'shown').map(stepOf);
}

// ---------------------------------------------------------------- results

export interface ResultRow {
  session_id: string;
  completed_at: string;
  computed_at: string;
  algo_version: number;
  norm_version: string;
  bank_version: string;
  overall: number | null;
  price_c: number | null;
  price_w: number | null;
  price_n: number | null;
  price_b: number | null;
  price_m: number | null;
  grade: string;
}

/**
 * SQL for "the result to show for each completed session": the row computed with the current
 * algorithm and norm when there is one, otherwise the newest row. $1 is the user id, $2 the
 * current algorithm version, $3 the current norm version. Oldest check first.
 */
const SHOWN_RESULTS = `
  select distinct on (s.completed_at, s.id)
    r.session_id, s.completed_at, r.computed_at, r.algo_version, r.norm_version, r.bank_version,
    r.overall, r.price_c, r.price_w, r.price_n, r.price_b, r.price_m, r.grade
  from sessions s join results r on r.session_id = s.id
  where s.user_id = $1 and s.completed_at is not null
  order by s.completed_at, s.id, (r.algo_version = $2 and r.norm_version = $3) desc, r.computed_at desc`;

/** One light row per completed check of the user, oldest first. */
export async function shownResults(db: Db, userId: string, current: VersionSet): Promise<ResultRow[]> {
  return db.query<ResultRow>(SHOWN_RESULTS, [userId, current.algo, current.norm]);
}

export function versionsOf(row: Pick<ResultRow, 'algo_version' | 'norm_version' | 'bank_version'>): VersionSet {
  return { algo: row.algo_version, bank: row.bank_version, norm: row.norm_version };
}

export function pricesOf(row: ResultRow): Record<AreaId, number | null> {
  return { C: row.price_c, W: row.price_w, N: row.price_n, B: row.price_b, M: row.price_m };
}

/** The full stored result behind a light row. */
export async function storedResult(db: Db, row: ResultRow): Promise<StoredResult> {
  const full = await first<{ result: Result }>(
    db,
    'select result from results where session_id = $1 and algo_version = $2 and norm_version = $3',
    [row.session_id, row.algo_version, row.norm_version],
  );
  if (!full) throw new ApiError(500, 'internal_error', 'stored result is missing');
  return {
    sessionId: row.session_id,
    completedAt: row.completed_at,
    computedAt: row.computed_at,
    versions: versionsOf(row),
    result: full.result,
  };
}
