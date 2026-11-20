/**
 * Checks: creating a session, receiving question events as they happen, resuming, completing
 * (PROMPT.md sections 5 and 7.1).
 */
import {
  CLIENT_ID_PATTERN,
  EVENT_ACTIONS,
  HEALTH_AREAS,
  MAX_ANSWER_SECONDS,
  MAX_EVENTS_PER_REQUEST,
  TICKER_PATTERN,
  US_STATES,
  VISIT_MAX_SKEW_DAYS,
  type CompleteSessionResponse,
  type CreateSessionResponse,
  type EventAction,
  type OpenSessionResponse,
  type OverallChange,
  type PostEventsResponse,
  type QuestionEventInput,
  type SessionResponse,
  type UsState,
} from '../../shared/api';
import {
  BANKS,
  CURRENT,
  ROLE_IDS,
  compute,
  displayOrder,
  getBank,
  nextQuestion,
  orderDirection,
  whereOf,
  type AreaId,
  type Background,
  type Bank,
  type ItemVersion,
  type NextQuestion,
  type OrderDirection,
  type Result,
  type Step,
} from '../../engine';
import { requireUser, type UserRow } from '../auth';
import type { FunnelEventName } from '../posthog';
import { randomId } from '../crypto';
import type { Db } from '../db';
import { first } from '../db';
import {
  ApiError,
  daysBetween,
  invalid,
  isDay,
  isInt,
  isOneOf,
  isRecord,
  json,
  readBody,
  utcDay,
  type Deps,
} from '../http';
import {
  backgroundOf,
  excludedAreasOf,
  insertResult,
  latestOpenSession,
  loadEvents,
  loadSession,
  pricesOf,
  sessionInfo,
  shownResults,
  stepOf,
  stepsOf,
  storedResult,
  type EventRow,
  type ResultRow,
  type SessionRow,
} from '../sessions';

// ---------------------------------------------------------------- create

/**
 * The local date a client sent, checked against server time. Falls back to the UTC date when
 * none was sent. A date further than VISIT_MAX_SKEW_DAYS from the server's is refused with
 * clock_skew: used for records that are kept per day (micro-app entries, visits).
 */
export function checkedLocalDay(value: unknown, now: Date): string {
  const today = utcDay(now);
  if (value === undefined || value === null) return today;
  if (!isDay(value)) throw invalid('localDate must be a date written YYYY-MM-DD');
  if (Math.abs(daysBetween(today, value)) > VISIT_MAX_SKEW_DAYS) {
    throw new ApiError(400, 'clock_skew', 'localDate is too far from the server date', { serverDate: today });
  }
  return value;
}

/**
 * The same, for reads and for starting a check: a device whose clock is days off still sees its
 * prices and can take the check. Its date is replaced by the server's UTC date.
 */
export function clampedLocalDay(value: unknown, now: Date): string {
  const today = utcDay(now);
  if (value === undefined || value === null) return today;
  if (!isDay(value)) throw invalid('localDate must be a date written YYYY-MM-DD');
  return Math.abs(daysBetween(today, value)) > VISIT_MAX_SKEW_DAYS ? today : value;
}

function checkedBackground(bank: Bank, value: unknown): Background {
  if (!isRecord(value)) throw invalid('background is required');
  if (!isOneOf(value.role, ROLE_IDS)) throw invalid('background.role is not a known role');
  if (!isInt(value.age, 0, bank.ages.length - 1)) throw invalid('background.age is not an age band of the bank');
  if (!isRecord(value.extra)) throw invalid('background.extra is required');
  const questions = bank.extra[value.role];
  const extra: Record<string, number> = {};
  for (const question of questions) {
    const k = value.extra[question.id];
    if (!isInt(k, 0, question.opts.length - 1)) {
      throw invalid(`background.extra.${question.id} is missing or out of range`, { question: question.id });
    }
    extra[question.id] = k;
  }
  const known = new Set(questions.map((q) => q.id));
  for (const key of Object.keys(value.extra)) {
    if (!known.has(key)) throw invalid(`background.extra.${key} is not a background question of this role`);
  }
  return { age: value.age, role: value.role, extra };
}

/** POST /api/sessions */
export async function createSession(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);

  if (typeof body.bankVersion !== 'string' || body.bankVersion !== CURRENT.bank) {
    throw new ApiError(409, 'bank_version_mismatch', 'the client is on another bank version: reload', {
      current: CURRENT.bank,
    });
  }
  const bank = getBank(CURRENT.bank);
  const background = checkedBackground(bank, body.background);
  if (!isOneOf(body.lang, ['zh', 'en'] as const)) throw invalid('lang must be "zh" or "en"');
  if (typeof body.healthConsent !== 'boolean') throw invalid('healthConsent must be true or false');
  if (body.healthConsent && !user.health_consent_version) {
    throw new ApiError(403, 'health_consent_required', 'body and mind questions need the health consent');
  }
  let usState: UsState | null = null;
  if (body.usState !== undefined && body.usState !== null && body.usState !== '') {
    if (!isOneOf(body.usState, US_STATES)) throw invalid('usState is not a US state code');
    usState = body.usState;
  }
  let ticker: string | null = null;
  if (body.ticker !== undefined && body.ticker !== null && body.ticker !== '') {
    if (typeof body.ticker !== 'string' || !TICKER_PATTERN.test(body.ticker)) {
      throw invalid('ticker must be 2 to 6 letters or digits');
    }
    ticker = body.ticker.toUpperCase();
  }
  if (body.id !== undefined && (typeof body.id !== 'string' || !CLIENT_ID_PATTERN.test(body.id))) {
    throw invalid('id must be 16 to 64 URL-safe characters');
  }
  const now = deps.now();
  const localDay = clampedLocalDay(body.localDate, now);
  const at = now.toISOString();
  const id = typeof body.id === 'string' ? body.id : randomId();

  if (typeof body.id === 'string') {
    const existing = await first<{ user_id: string }>(deps.db, 'select user_id from sessions where id = $1', [id]);
    if (existing) {
      if (existing.user_id !== user.id) throw new ApiError(409, 'id_conflict', 'this session id is taken');
      const response: CreateSessionResponse = {
        session: sessionInfo(await loadSession(deps.db, user.id, id)),
        created: false,
      };
      return json(response);
    }
  }

  const created = await deps.db.transaction(async (tx) => {
    // Two requests with the same client id (a retried start) can both get past the read above.
    // The second insert does nothing, and the existing check is returned.
    const inserted = await tx.query<{ id: string }>(
      `insert into sessions (id, user_id, created_at, local_day, age, role, extra, us_state, ticker, lang,
         bank_version, health_consent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (id) do nothing
       returning id`,
      [
        id,
        user.id,
        at,
        localDay,
        background.age,
        background.role,
        JSON.stringify(background.extra),
        usState,
        ticker,
        body.lang,
        bank.bank_version,
        body.healthConsent,
      ],
    );
    if (inserted.length === 0) return false;
    await tx.query('update users set age = $1, role = $2, us_state = $3, ticker = $4, lang = $5 where id = $6', [
      background.age,
      background.role,
      usState,
      ticker,
      body.lang,
      user.id,
    ]);
    // Starting a check is also a visit on that day.
    await tx.query('insert into visits (user_id, day, first_at) values ($1, $2, $3) on conflict do nothing', [
      user.id,
      localDay,
      at,
    ]);
    return true;
  });
  if (!created) {
    const owner = await first<{ user_id: string }>(deps.db, 'select user_id from sessions where id = $1', [id]);
    if (owner?.user_id !== user.id) throw new ApiError(409, 'id_conflict', 'this session id is taken');
    const response: CreateSessionResponse = { session: sessionInfo(await loadSession(deps.db, user.id, id)), created: false };
    return json(response);
  }

  deps.track?.({ name: 'check_started', userId: user.id, at, sessionId: id });
  const response: CreateSessionResponse = {
    session: sessionInfo(await loadSession(deps.db, user.id, id)),
    created: true,
  };
  return json(response, 201);
}

// ---------------------------------------------------------------- read, resume

async function sessionResponse(db: Db, session: SessionRow): Promise<SessionResponse> {
  const events = await loadEvents(db, session.id);
  const steps = stepsOf(events);
  // A question that was shown and not answered yet: the person left on it.
  const last = events[events.length - 1];
  // Only while it is still the question the path has there: a consent withdrawn while a Body or
  // Mind question was on screen takes that question off the path.
  const next =
    !session.completed_at && last && last.action === 'shown' && last.seq === steps.length && Object.hasOwn(BANKS, session.bank_version)
      ? nextQuestion(getBank(session.bank_version), backgroundOf(session), steps, { excludedAreas: excludedAreasOf(session) })
      : null;
  const pending =
    next && last && next.id === last.item_id && next.key === last.version_key
      ? {
          seq: last.seq,
          itemId: last.item_id,
          versionKey: last.version_key,
          displayDirection: last.display_direction,
        }
      : null;
  return { session: sessionInfo(session), steps, pending };
}

/** GET /api/sessions/:id */
export async function getSession(request: Request, deps: Deps, sessionId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  const response: SessionResponse = await sessionResponse(deps.db, await loadSession(deps.db, user.id, sessionId));
  return json(response);
}

/** GET /api/sessions/open */
export async function getOpenSession(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const session = await latestOpenSession(deps.db, user.id);
  const response: OpenSessionResponse = { open: session ? await sessionResponse(deps.db, session) : null };
  return json(response);
}

// ---------------------------------------------------------------- events

/** The funnel event each stored question event is forwarded as. */
const FUNNEL_NAME_OF: Record<EventAction, FunnelEventName> = {
  shown: 'question_shown',
  select: 'question_answered',
  skip: 'question_skipped',
  na: 'question_not_applicable',
};

/** Options in the order they were on screen for a display direction. */
function displayedOrder(version: ItemVersion, direction: OrderDirection): number[] {
  // The engine derives the direction from a random number; pick one that gives this direction.
  const rng = [0, 0.999999].find((r) => orderDirection(r) === direction);
  if (rng === undefined) throw new ApiError(500, 'internal_error', 'cannot rebuild the display order');
  return displayOrder(version, rng);
}

function eventError(index: number, event: { seq?: unknown; action?: unknown }, message: string, more = {}): ApiError {
  return new ApiError(422, 'event_invalid', message, { index, seq: event.seq, action: event.action, ...more });
}

/**
 * Checks one event on its own and against the bank: fields, question, version, option index,
 * seconds, click position. Returns the event as an EventRow.
 */
function checkedEvent(bank: Bank, raw: unknown, index: number): EventRow {
  if (!isRecord(raw)) throw eventError(index, {}, 'an event must be an object');
  const e = raw as Partial<Record<keyof QuestionEventInput, unknown>>;
  if (!isInt(e.seq, 0, 200)) throw eventError(index, e, 'seq must be a whole number from 0');
  if (!isOneOf(e.action, EVENT_ACTIONS)) throw eventError(index, e, 'action must be shown, select, skip or na');
  if (e.bankVersion !== bank.bank_version) {
    throw eventError(index, e, 'bankVersion is not the bank version of the session', { expected: bank.bank_version });
  }
  if (!isOneOf(e.lang, ['zh', 'en'] as const)) throw eventError(index, e, 'lang must be "zh" or "en"');
  if (!isOneOf(e.displayDirection, ['best_first', 'worst_first'] as const)) {
    throw eventError(index, e, 'displayDirection must be best_first or worst_first');
  }
  if (typeof e.itemId !== 'string' || !Object.hasOwn(bank.items, e.itemId)) {
    throw eventError(index, e, 'itemId is not a question of the bank');
  }
  const version = bank.items[e.itemId].versions.find((v) => v.key === e.versionKey);
  if (!version) throw eventError(index, e, 'versionKey is not a version of this question');

  let optionIndex: number | null = null;
  let seconds: number | null = null;
  let clickPosition: EventRow['click_position'] = null;
  const validSeconds = (s: unknown): s is number =>
    typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= MAX_ANSWER_SECONDS;

  if (e.action === 'select') {
    if (!isInt(e.optionIndex, 0, version.opts.length - 1)) {
      throw eventError(index, e, 'optionIndex is not an option of this version', { options: version.opts.length });
    }
    if (!validSeconds(e.seconds)) {
      throw eventError(index, e, `seconds must be a number from 0 to ${MAX_ANSWER_SECONDS}`);
    }
    const expected = whereOf(e.optionIndex, displayedOrder(version, e.displayDirection));
    if (e.clickPosition !== expected) {
      throw eventError(index, e, 'clickPosition does not match the option and the display direction', { expected });
    }
    optionIndex = e.optionIndex;
    seconds = e.seconds;
    clickPosition = expected;
  } else {
    if (e.optionIndex !== null && e.optionIndex !== undefined) {
      throw eventError(index, e, 'optionIndex must be null unless the action is select');
    }
    if (e.clickPosition !== null && e.clickPosition !== undefined) {
      throw eventError(index, e, 'clickPosition must be null unless the action is select');
    }
    // A skip and a not-applicable may carry the time it took to decide.
    if ((e.action === 'skip' || e.action === 'na') && e.seconds !== null && e.seconds !== undefined) {
      if (!validSeconds(e.seconds)) {
        throw eventError(index, e, `seconds must be a number from 0 to ${MAX_ANSWER_SECONDS}`);
      }
      seconds = e.seconds;
    }
    if (e.action === 'shown' && e.seconds !== null && e.seconds !== undefined) {
      throw eventError(index, e, 'seconds must be null for a shown event');
    }
  }
  return {
    seq: e.seq,
    action: e.action,
    item_id: e.itemId,
    version_key: version.key,
    lang: e.lang,
    option_index: optionIndex,
    seconds,
    display_direction: e.displayDirection,
    click_position: clickPosition,
  };
}

/** POST /api/sessions/:id/events */
export async function postEvents(request: Request, deps: Deps, sessionId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);
  if (!Array.isArray(body.events) || body.events.length === 0) throw invalid('events must be a non-empty array');
  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    throw invalid(`at most ${MAX_EVENTS_PER_REQUEST} events per request`, { max: MAX_EVENTS_PER_REQUEST });
  }
  const rawEvents: unknown[] = body.events;
  // One request per check at a time. The path depends on earlier answers, so two devices or
  // tabs sending the same check must not both validate against the same stored events. The row
  // lock serializes them on hosted Postgres; PGlite has one connection and serializes anyway.
  const work = await deps.db.transaction(async (tx) => {
    await tx.query('select id from sessions where id = $1 and user_id = $2 for update', [sessionId, user.id]);
    let inserted: Array<{ seq: number; action: string }> = [];
    const session = await loadSession(tx, user.id, sessionId);
    if (!Object.hasOwn(BANKS, session.bank_version)) {
      // Not retryable: the device drops these events and reads the server again, so its queue
      // is not held up behind a check that can no longer be answered.
      throw new ApiError(409, 'session_completed', 'this check was answered with a question bank that is no longer served');
    }
    const bank = getBank(session.bank_version);
    const incoming = rawEvents.map((raw, index) => checkedEvent(bank, raw, index));

    const stored = await loadEvents(tx, session.id);
    const storedKeys = new Set(stored.map((e) => `${e.seq}:${e.action}`));
    const steps: Step[] = stepsOf(stored);
    const background = backgroundOf(session);
    const excludedAreas = excludedAreasOf(session);
    const healthAllowed = session.health_consent && user.health_consent_version !== null;

    let next: NextQuestion | null | undefined;
    const expected = (): NextQuestion | null => {
      if (next === undefined) next = nextQuestion(bank, background, steps, { excludedAreas });
      return next;
    };

    const results: PostEventsResponse['results'] = [];
    const fresh: EventRow[] = [];
    incoming.forEach((event, index) => {
      const answer = event.action !== 'shown';
      const key = `${event.seq}:${event.action}`;
      // Sent before, or the question already has its answer: the first one wins.
      if (storedKeys.has(key) || (answer && event.seq < steps.length)) {
        results.push({ seq: event.seq, action: event.action, status: 'duplicate' });
        return;
      }
      if (session.completed_at) {
        throw new ApiError(409, 'session_completed', 'this check is completed and takes no new events', { index });
      }
      // Without the health consent the server takes nothing about body and mind.
      const area = bank.items[event.item_id].area;
      if ((HEALTH_AREAS as readonly string[]).includes(area) && !healthAllowed) {
        throw new ApiError(403, 'health_consent_required', 'body and mind answers need the health consent', {
          index,
          seq: event.seq,
          action: event.action,
          itemId: event.item_id,
        });
      }
      if (event.seq > steps.length) {
        throw new ApiError(409, 'event_out_of_order', 'an earlier question has no answer yet', {
          index,
          seq: event.seq,
          action: event.action,
          expectedSeq: steps.length,
        });
      }
      // The question at this position: an answered one (only "shown" gets here) or the next one.
      const at =
        event.seq < steps.length
          ? { id: steps[event.seq].id, key: steps[event.seq].key }
          : (() => {
              const q = expected();
              return q ? { id: q.id, key: q.key } : null;
            })();
      if (!at || at.id !== event.item_id || at.key !== event.version_key) {
        throw new ApiError(422, 'event_not_on_path', 'this is not the question the path has at this position', {
          index,
          seq: event.seq,
          action: event.action,
          expected: at ? { itemId: at.id, versionKey: at.key } : null,
        });
      }
      storedKeys.add(key);
      fresh.push(event);
      results.push({ seq: event.seq, action: event.action, status: 'stored' });
      if (answer) {
        steps.push(stepOf(event));
        next = undefined;
      }
    });

    if (fresh.length > 0) {
      // Write budget: two rows per question (shown, then select, skip or na), so one full check
      // writes at most 68 rows here. All rows of a request go in as one statement.
      inserted = await tx.query<{ seq: number; action: string }>(
        `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, option_index,
           seconds, display_direction, click_position, bank_version, source, at)
         select $1, x.seq, x.action, $2, x.item_id, x.version_key, x.lang, x.option_index, x.seconds,
           x.display_direction, x.click_position, $3, 'questionnaire', $4
         from jsonb_to_recordset($5::jsonb) as x(seq integer, action text, item_id text, version_key text, lang text,
           option_index integer, seconds double precision, display_direction text, click_position text)
         on conflict do nothing
         returning seq, action`,
        [session.id, user.id, bank.bank_version, deps.now().toISOString(), JSON.stringify(fresh)],
      );
    }
    return { session, bank, fresh, results, steps, expected, inserted };
  });
  const { session, fresh, results, steps, expected, inserted } = work;
  if (fresh.length > 0) {
    // A parallel request may have stored some of them first. Report those as duplicates.
    const written = new Set(inserted.map((r) => `${r.seq}:${r.action}`));
    for (const r of results) {
      if (r.status === 'stored' && !written.has(`${r.seq}:${r.action}`)) r.status = 'duplicate';
    }
    // Funnel events for what was stored: which question, how long, where on the path. Never
    // the option, the click position or the display direction.
    if (deps.track) {
      const at = deps.now().toISOString();
      for (const event of fresh) {
        if (!written.has(`${event.seq}:${event.action}`)) continue;
        deps.track({
          name: FUNNEL_NAME_OF[event.action],
          userId: user.id,
          at,
          sessionId: session.id,
          itemId: event.item_id,
          versionKey: event.version_key,
          seconds: event.action === 'shown' ? null : event.seconds,
          position: event.seq,
        });
      }
    }
  }

  const response: PostEventsResponse = { results, answered: steps.length, finished: expected() === null };
  return json(response);
}

// ---------------------------------------------------------------- complete

/** Change of the overall price from one stored check to the next. */
export function overallChange(previous: ResultRow, overall: number | null): OverallChange {
  const delta = previous.overall !== null && overall !== null ? overall - previous.overall : null;
  return {
    previousSessionId: previous.session_id,
    previousAt: previous.completed_at,
    previousOverall: previous.overall,
    delta,
    percent: delta !== null && previous.overall ? (delta / previous.overall) * 100 : null,
  };
}

/** POST /api/sessions/:id/complete */
export async function completeSession(request: Request, deps: Deps, sessionId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  const session = await loadSession(deps.db, user.id, sessionId);
  // The device's local date at completion. Optional, for clients that predate it.
  const body = await readBody(request);
  const completedDay = body.localDate === undefined ? null : clampedLocalDay(body.localDate, deps.now());

  if (!session.completed_at) {
    const bank = getBank(session.bank_version);
    const background = backgroundOf(session);
    const excludedAreas = excludedAreasOf(session);
    const steps = stepsOf(await loadEvents(deps.db, session.id));
    const open = nextQuestion(bank, background, steps, { excludedAreas });
    if (open) {
      throw new ApiError(409, 'session_incomplete', 'questions are left', {
        answered: open.index,
        total: open.total,
        next: { itemId: open.id, versionKey: open.key },
      });
    }
    // The previous check gives the top gainer and top loser of this one.
    const before = await shownResults(deps.db, user.id, CURRENT);
    const previous = before.length > 0 ? pricesOf(before[before.length - 1]) : null;
    const result = compute({ bank, background, steps, excludedAreas, previous });
    const at = deps.now().toISOString();

    const firstTime = await deps.db.transaction(async (tx) => {
      // Two completions at once: the first one sets completed_at, the second one changes nothing
      // and is not counted again.
      const marked = await tx.query<{ id: string }>(
        'update sessions set completed_at = $1, completed_local_day = $2 where id = $3 and completed_at is null returning id',
        [at, completedDay, session.id],
      );
      if (marked.length === 0) return false;
      // Derived record: the three versions are stored with it so it can be recomputed and compared.
      await insertResult(tx, session.id, user.id, at, result);
      return true;
    });
    if (firstTime) deps.track?.({ name: 'check_completed', userId: user.id, at, sessionId: session.id });
  }

  // Read back what is stored, so a first call and a repeated call answer the same.
  const all = await shownResults(deps.db, user.id, CURRENT);
  const position = all.findIndex((r) => r.session_id === session.id);
  if (position < 0) throw new ApiError(500, 'internal_error', 'the result was not stored');
  const response: CompleteSessionResponse = {
    stored: await storedResult(deps.db, all[position]),
    change: position > 0 ? overallChange(all[position - 1], all[position].overall) : null,
  };
  return json(response);
}
