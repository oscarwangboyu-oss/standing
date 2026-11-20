/**
 * The four micro apps of stage 2: Daily Open (body and mind), Payday Check (wealth), Weekly
 * Win (capability), People Nudge (network).
 *
 * Each endpoint stores one raw, append-only record and answers with the live price computed
 * from all records, so the page can show today's price at once. Rows are inserted and never
 * updated: a retried send and a second daily entry for the same day are not stored, and the
 * first one stands.
 *
 * What the server accepts is narrow on purpose.
 * - Every request may carry the fields listed for it below and nothing else. An unknown field
 *   is refused, so free text (a name, a course title) and money amounts have no way in.
 * - Every value is a tap, a band, a category or a count: a small whole number or a word from
 *   a fixed list.
 * - Payday takes bands only. The three amounts and the setup stay on the device. A payday
 *   request with any other field, or with a number that is not a band, is refused with
 *   amounts_not_accepted and nothing is stored.
 *
 * Each app has a stage switch (GET /api/config). While it is off its endpoint answers 403
 * feature_off. Completions are forwarded to PostHog as micro_app_completed with the name of
 * the app and no values.
 */
import {
  CLIENT_ID_PATTERN,
  PAYDAY_ENTRY_FIELDS,
  type FeatureFlags,
  type MicroApp,
  type MicroEntryResponse,
} from '../../shared/api';
import {
  BANK_BANDS,
  CERTIFICATE_LEVELS,
  NUDGE_CATEGORIES,
  WEEKLY_WIN_KINDS,
  canLogDailyFor,
  getAlgo,
  getBank,
  paydayEligible,
  type NudgeCategory,
} from '../../engine';
import { requireUser, type UserRow } from '../auth';
import { MAX_MICRO_ENTRIES_PER_DAY } from '../config';
import { first } from '../db';
import { ApiError, invalid, isDay, isInt, isOneOf, json, readBody, type Deps } from '../http';
import { latestCheck, liveOf, loadPerson, type LoadedPerson } from '../live';
import { backgroundOf } from '../sessions';
import { checkedLocalDay } from './sessions';

const FLAG_OF: Record<MicroApp, keyof FeatureFlags> = {
  daily_open: 'dailyOpen',
  payday: 'payday',
  weekly_win: 'weeklyWin',
  people_nudge: 'peopleNudge',
};

const DAILY_FIELDS = ['localDate', 'day', 'sleep', 'exercise', 'state'] as const;
const WEEKLY_WIN_FIELDS = ['id', 'localDate', 'kind', 'hours', 'exam', 'level'] as const;
const PEOPLE_NUDGE_FIELDS = ['id', 'localDate', 'planned', 'reached'] as const;

/** Fields of the body that are not on the list. */
function unknownFields(body: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

interface Opened {
  user: UserRow;
  body: Record<string, unknown>;
  now: Date;
}

interface Started extends Opened {
  /** The device's local date, checked against server time. */
  today: string;
  person: LoadedPerson;
}

/** What every micro-app request goes through first: sign-in, the switch, the body. */
async function open(request: Request, deps: Deps, app: MicroApp): Promise<Opened> {
  const user = await requireUser(request, deps);
  if (!deps.env.flags[FLAG_OF[app]]) throw new ApiError(403, 'feature_off', `${app} is switched off`);
  return { user, body: await readBody(request), now: deps.now() };
}

/**
 * The local date of the request and the person's records. Called once the fields are known to
 * be allowed. Every micro app needs a completed check: the price starts from it.
 */
async function start(deps: Deps, opened: Opened): Promise<Started> {
  if (opened.body.localDate === undefined || opened.body.localDate === null) throw invalid('localDate is required');
  const today = checkedLocalDay(opened.body.localDate, opened.now);
  const person = await loadPerson(deps.db, opened.user.id, today, opened.user.health_consent_version !== null);
  if (person.checks.length === 0) {
    throw new ApiError(409, 'check_required', 'complete a check first: the price starts from it');
  }
  return { ...opened, today, person };
}

function clientId(value: unknown): string {
  if (typeof value !== 'string' || !CLIENT_ID_PATTERN.test(value)) {
    throw invalid('id must be 16 to 64 URL-safe characters');
  }
  return value;
}

/**
 * For the three apps that take a client id: true when the id is already stored (a retried
 * send). Throws when the person has reached the daily cap of the app.
 */
async function alreadyStored(deps: Deps, table: string, userId: string, id: string, day: string): Promise<boolean> {
  // The table name comes from this file, never from the request.
  if (await first(deps.db, `select 1 as x from ${table} where user_id = $1 and id = $2`, [userId, id])) return true;
  const row = await first<{ n: number }>(deps.db, `select count(*)::int as n from ${table} where user_id = $1 and day = $2`, [
    userId,
    day,
  ]);
  if ((row?.n ?? 0) >= MAX_MICRO_ENTRIES_PER_DAY) {
    throw new ApiError(429, 'entry_limit', `at most ${MAX_MICRO_ENTRIES_PER_DAY} entries a day`);
  }
  return false;
}

/** The answer of every micro-app endpoint. Reads the records again when one was stored. */
async function finish(deps: Deps, started: Started, app: MicroApp, stored: boolean, day: string): Promise<Response> {
  const { user, today } = started;
  if (stored) deps.track?.({ name: 'micro_app_completed', userId: user.id, at: started.now.toISOString(), app });
  const person = stored ? await loadPerson(deps.db, user.id, today, user.health_consent_version !== null) : started.person;
  const response: MicroEntryResponse = { stored, day, live: liveOf(person, user, deps.env.flags, today) };
  return json(response, stored ? 201 : 200);
}

// ---------------------------------------------------------------- daily open

/** A tap: null, or an option index below `count`. */
function tap(value: unknown, count: number, name: string): number | null {
  if (value === null || value === undefined) return null;
  if (!isInt(value, 0, count - 1)) throw invalid(`${name} must be null or a whole number from 0 to ${count - 1}`);
  return value;
}

/** POST /api/daily */
export async function postDaily(request: Request, deps: Deps): Promise<Response> {
  const opened = await open(request, deps, 'daily_open');
  const { user, body } = opened;
  if (user.health_consent_version === null) {
    throw new ApiError(403, 'health_consent_required', 'the daily open records body and mind data and needs the health consent');
  }
  const unknown = unknownFields(body, DAILY_FIELDS);
  if (unknown.length > 0) throw invalid('the daily open takes three taps and nothing else', { fields: unknown });
  const params = getAlgo().live.dailyOpen;
  const sleep = tap(body.sleep, params.sleep.midpointHours.length, 'sleep');
  const exercise = tap(body.exercise, params.exercise.midpointMinutes.length, 'exercise');
  const state = tap(body.state, params.state.scores.length, 'state');
  if (sleep === null && exercise === null && state === null) throw invalid('at least one of sleep, exercise and state is required');

  const started = await start(deps, opened);
  const day = body.day === undefined || body.day === null ? started.today : body.day;
  if (!isDay(day)) throw invalid('day must be a date written YYYY-MM-DD');
  if (!canLogDailyFor(day, started.today)) {
    throw new ApiError(409, 'day_closed', 'a daily entry can be recorded for today or filled in for yesterday', {
      today: started.today,
    });
  }
  const inserted = await deps.db.query(
    `insert into daily_entries (user_id, day, logged_on, sleep, exercise, state, at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict do nothing
     returning day`,
    [user.id, day, started.today, sleep, exercise, state, started.now.toISOString()],
  );
  return finish(deps, started, 'daily_open', inserted.length > 0, day);
}

// ---------------------------------------------------------------- payday

function amountsRefused(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(
    400,
    'amounts_not_accepted',
    `${message}. The payday check sends bands only; amounts stay on the device`,
    details,
  );
}

/** A band: null, or one of the option indices the band table of the bank lists. */
function band(value: unknown, bankVersion: string, bandName: string, name: string): number | null {
  if (value === null) return null;
  const options = BANK_BANDS[bankVersion]?.[bandName]?.optionForBand ?? [];
  if (typeof value !== 'number' || !Number.isInteger(value) || !options.includes(value)) {
    throw amountsRefused(`${name} must be null or the option index of a band`);
  }
  return value;
}

/** POST /api/payday */
export async function postPayday(request: Request, deps: Deps): Promise<Response> {
  const opened = await open(request, deps, 'payday');
  const { user, body } = opened;
  // First of all: nothing but the band fields. An amount has no field to arrive in.
  const unknown = unknownFields(body, PAYDAY_ENTRY_FIELDS);
  if (unknown.length > 0) throw amountsRefused('unknown fields', { fields: unknown });
  for (const field of ['periods', 'saveShare', 'runway', 'baselineDay'] as const) {
    if (body[field] === undefined) throw invalid(`${field} is required (null when there is none)`);
  }
  const id = clientId(body.id);
  const params = getAlgo().live.payday;
  if (!isInt(body.periods, 0, params.averagePeriods)) {
    throw amountsRefused(`periods must be a whole number from 0 to ${params.averagePeriods}`);
  }
  const periods = body.periods;

  const started = await start(deps, opened);
  const latest = latestCheck(started.person);
  if (latest === null) throw new ApiError(409, 'check_required', 'complete a check first');
  const bankVersion = latest.session.bank_version;
  if (!paydayEligible(getBank(bankVersion), backgroundOf(latest.session))) {
    throw new ApiError(403, 'payday_not_eligible', 'the payday check is offered to people who live on their own earnings');
  }
  const saveShare = band(body.saveShare, bankVersion, params.saveShare.band, 'saveShare');
  const runway = band(body.runway, bankVersion, params.runway.band, 'runway');
  if ((periods === 0) !== (saveShare === null)) throw invalid('periods is 0 exactly when saveShare is null');
  let baselineDay: string | null = null;
  if (body.baselineDay !== null) {
    if (!isDay(body.baselineDay) || !started.person.checks.some((c) => c.day === body.baselineDay)) {
      throw invalid('baselineDay must be null or the day of a completed check of this user');
    }
    baselineDay = body.baselineDay;
  }
  if (runway !== null && baselineDay === null) throw invalid('runway needs the baselineDay it was estimated from');

  const day = started.today;
  let stored = false;
  if (!(await alreadyStored(deps, 'payday_entries', user.id, id, day))) {
    const inserted = await deps.db.query(
      `insert into payday_entries (user_id, id, day, periods, save_share, runway, baseline_day, at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict do nothing
       returning id`,
      [user.id, id, day, periods, saveShare, runway, baselineDay, started.now.toISOString()],
    );
    stored = inserted.length > 0;
  }
  return finish(deps, started, 'payday', stored, day);
}

// ---------------------------------------------------------------- weekly win

/** POST /api/weekly-wins */
export async function postWeeklyWin(request: Request, deps: Deps): Promise<Response> {
  const opened = await open(request, deps, 'weekly_win');
  const { user, body } = opened;
  const unknown = unknownFields(body, WEEKLY_WIN_FIELDS);
  if (unknown.length > 0) {
    throw invalid('a weekly win is a category and counts; the title stays on the device', { fields: unknown });
  }
  const id = clientId(body.id);
  if (!isOneOf(body.kind, WEEKLY_WIN_KINDS)) throw invalid(`kind must be one of ${WEEKLY_WIN_KINDS.join(', ')}`);
  const kind = body.kind;
  let hours: number | null = null;
  let exam: boolean | null = null;
  let level: string | null = null;
  const given = (field: string) => body[field] !== undefined && body[field] !== null;
  if (kind === 'course') {
    hours = tap(body.hours, getAlgo().live.weeklyWin.learning.midpointHours.length, 'hours');
  } else if (given('hours')) {
    throw invalid('hours belongs to a course');
  }
  if (kind === 'certificate') {
    if (typeof body.exam !== 'boolean') throw invalid('exam must be true or false for a certificate');
    if (!isOneOf(body.level, CERTIFICATE_LEVELS)) throw invalid(`level must be one of ${CERTIFICATE_LEVELS.join(', ')}`);
    exam = body.exam;
    level = body.level;
  } else if (given('exam') || given('level')) {
    throw invalid('exam and level belong to a certificate');
  }

  const started = await start(deps, opened);
  const day = started.today;
  let stored = false;
  if (!(await alreadyStored(deps, 'weekly_wins', user.id, id, day))) {
    const inserted = await deps.db.query(
      `insert into weekly_wins (user_id, id, day, kind, hours, exam, level, at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict do nothing
       returning id`,
      [user.id, id, day, kind, hours, exam, level, started.now.toISOString()],
    );
    stored = inserted.length > 0;
  }
  return finish(deps, started, 'weekly_win', stored, day);
}

// ---------------------------------------------------------------- people nudge

/** POST /api/people-nudges */
export async function postPeopleNudge(request: Request, deps: Deps): Promise<Response> {
  const opened = await open(request, deps, 'people_nudge');
  const { user, body } = opened;
  const unknown = unknownFields(body, PEOPLE_NUDGE_FIELDS);
  if (unknown.length > 0) {
    throw invalid('a people nudge is counts by category; names stay on the device', { fields: unknown });
  }
  const id = clientId(body.id);
  const max = getAlgo().live.peopleNudge.maxPerWeek;
  if (!isInt(body.planned, 0, max)) throw invalid(`planned must be a whole number from 0 to ${max}`);
  if (!Array.isArray(body.reached) || body.reached.length > max) {
    throw invalid(`reached must be a list of at most ${max} categories`);
  }
  const counts = Object.fromEntries(NUDGE_CATEGORIES.map((c) => [c, 0])) as Record<NudgeCategory, number>;
  for (const category of body.reached as unknown[]) {
    if (!isOneOf(category, NUDGE_CATEGORIES)) throw invalid(`reached holds categories only: ${NUDGE_CATEGORIES.join(', ')}`);
    counts[category] += 1;
  }

  const started = await start(deps, opened);
  const day = started.today;
  let stored = false;
  if (!(await alreadyStored(deps, 'people_nudges', user.id, id, day))) {
    const inserted = await deps.db.query(
      `insert into people_nudges (user_id, id, day, planned, reached_family, reached_friend, reached_mentor,
         reached_work, reached_other, at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict do nothing
       returning id`,
      [user.id, id, day, body.planned, counts.family, counts.friend, counts.mentor, counts.work, counts.other, started.now.toISOString()],
    );
    stored = inserted.length > 0;
  }
  return finish(deps, started, 'people_nudge', stored, day);
}
