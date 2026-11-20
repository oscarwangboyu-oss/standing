/**
 * "Why it moved" (PROMPT.md section 8): for a change between two completed checks of the
 * signed-in user, the points each changed answer added to every sector price and to the
 * overall price. The method is the engine's breakdown(): put one changed answer back, score
 * again, take the difference, then scale so the lines add up to the change.
 *
 * Nothing is stored. Both checks are rebuilt from their raw events and scored with the
 * versions of the results the user sees for them, so the prices in the breakdown are the
 * prices on the chart.
 */
import type { BreakdownEnd, BreakdownResponse, DayBreakdownResponse, DayPrices } from '../../shared/api';
import { AREA_IDS, BANKS, CURRENT, breakdown, dayNumber, explainCheckDay, explainDays, getBank, type ComputeInput, type TimelinePoint } from '../../engine';
import { requireUser } from '../auth';
import type { Db } from '../db';
import { ApiError, invalid, isDay, json, type Deps } from '../http';
import { dayPricesOf, loadPerson, timelineOf } from '../live';
import { todayOf } from './me';
import {
  backgroundOf,
  excludedAreasOf,
  loadEvents,
  loadSession,
  shownResults,
  stepsOf,
  versionsOf,
  type ResultRow,
} from '../sessions';

async function inputOf(db: Db, userId: string, row: ResultRow): Promise<ComputeInput> {
  const session = await loadSession(db, userId, row.session_id);
  if (!Object.hasOwn(BANKS, session.bank_version)) {
    throw new ApiError(500, 'internal_error', 'the bank version of this check is no longer registered');
  }
  return {
    bank: getBank(session.bank_version),
    background: backgroundOf(session),
    steps: stepsOf(await loadEvents(db, session.id)),
    excludedAreas: excludedAreasOf(session),
    versions: versionsOf(row),
  };
}

const endOf = (row: ResultRow): BreakdownEnd => ({
  sessionId: row.session_id,
  at: row.completed_at,
  versions: versionsOf(row),
  overall: row.overall,
});

/** GET /api/me/breakdown?from=<session id>&to=<session id> */
export async function getBreakdown(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const params = new URL(request.url).searchParams;
  const rows = await shownResults(deps.db, user.id, CURRENT);
  const find = (name: 'from' | 'to'): number | null => {
    const id = params.get(name);
    if (id === null || id === '') return null;
    const index = rows.findIndex((r) => r.session_id === id);
    if (index < 0) throw new ApiError(404, 'not_found', `${name} is not a completed check of this user`);
    return index;
  };
  // Default: the latest check against the one before it. With `to` alone: that check against
  // the one before it.
  const to = find('to') ?? rows.length - 1;
  const from = find('from') ?? to - 1;
  if (to < 0 || from < 0 || from === to) {
    const response: BreakdownResponse = { from: null, to: to >= 0 && rows[to] ? endOf(rows[to]) : null, breakdown: null };
    return json(response);
  }
  const response: BreakdownResponse = {
    from: endOf(rows[from]),
    to: endOf(rows[to]),
    breakdown: breakdown(await inputOf(deps.db, user.id, rows[from]), await inputOf(deps.db, user.id, rows[to])),
  };
  return json(response);
}

/** True when the data of two days gives different prices: a target or a status differs in some sector. */
/** True when the micro-app records of a check day moved its targets away from what the check gave. */
function checkDayMoved(point: TimelinePoint): boolean {
  const check = point.check;
  if (!check) return false;
  return AREA_IDS.some((area) => {
    const x = check.prices[area];
    const y = point.sectors[area].target;
    if (x === null || y === null) return x !== y;
    return Math.abs(x - y) > 1e-9;
  });
}

/** The prices of a check day as the check gave them on its own. */
function checkPricesOf(point: TimelinePoint): DayPrices {
  const check = point.check as NonNullable<TimelinePoint['check']>;
  const sectors = {} as DayPrices['sectors'];
  for (const area of AREA_IDS) {
    const price = check.prices[area];
    sectors[area] = { status: price === null ? point.sectors[area].status : 'listed', price, target: price };
  }
  return { overall: check.overall, overallTarget: check.overall, sectors };
}

function targetsDiffer(a: TimelinePoint, b: TimelinePoint): boolean {
  return AREA_IDS.some((area) => {
    const x = a.sectors[area];
    const y = b.sectors[area];
    if (x.target === null || y.target === null) return x.target !== y.target;
    return Math.abs(x.target - y.target) > 1e-9;
  });
}

/**
 * GET /api/me/breakdown/day?day=&from=&today=
 *
 * Why the price moved between two days of the live series: the contribution of every answer,
 * daily reading, payday band, weekly win and people nudge to each sector and to the overall
 * price. Computed now; nothing is stored. See DayBreakdownResponse for the parameters.
 */
export async function getDayBreakdown(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const params = new URL(request.url).searchParams;
  const today = todayOf(request, deps.now());
  const person = await loadPerson(deps.db, user.id, today, user.health_consent_version !== null);
  const nothing: DayBreakdownResponse = { from: null, to: null, breakdown: null, prices: null };
  if (person.checks.length === 0) return json(nothing);
  const points = timelineOf(person, today).points;
  if (points.length === 0) return json(nothing);
  const start = dayNumber(points[0].day);
  const indexOf = (name: 'day' | 'from'): number | null => {
    const value = params.get(name);
    if (value === null || value === '') return null;
    if (!isDay(value)) throw invalid(`${name} must be a date written YYYY-MM-DD`);
    const index = dayNumber(value) - start;
    if (index < 0 || index >= points.length) {
      throw new ApiError(404, 'not_found', `${name} is outside the series`, {
        start: points[0].day,
        end: points[points.length - 1].day,
      });
    }
    return index;
  };

  let to = indexOf('day');
  let from = indexOf('from');
  if (to === null) {
    if (from !== null) throw invalid('from needs day');
    // The latest change: the last day on which the data gave another price than the day before,
    // or the first day when records made that day moved it from what the check gave.
    for (let i = points.length - 1; i >= 1 && to === null; i -= 1) {
      if (targetsDiffer(points[i - 1], points[i])) to = i;
    }
    if (to === null && checkDayMoved(points[0])) to = 0;
    if (to === null) return json(nothing);
  }
  if (from === null) from = to - 1;
  if (from < 0) {
    // The first day: what that day's records did to the check, if anything.
    const point = points[to];
    if (!checkDayMoved(point)) return json({ ...nothing, to: point.day } satisfies DayBreakdownResponse);
    const response: DayBreakdownResponse = {
      from: point.day,
      to: point.day,
      breakdown: explainCheckDay(person.history, point.day, person.options),
      prices: { from: checkPricesOf(point), to: dayPricesOf(point) },
    };
    return json(response);
  }
  if (from >= to) throw invalid('from must be before day');

  const response: DayBreakdownResponse = {
    from: points[from].day,
    to: points[to].day,
    breakdown: explainDays(person.history, points[from].day, points[to].day, person.options),
    prices: { from: dayPricesOf(points[from]), to: dayPricesOf(points[to]) },
  };
  return json(response);
}
