/**
 * Shared pieces of the team dashboard API (PROMPT.md section 7.2).
 *
 * The dashboard is read only and returns aggregates only. No query here selects a row of one
 * person, and every share is returned with the counts it came from.
 */
import type { Rate, TeamGoCriteria, TeamRedLines } from '../../shared/api';
import { DASHBOARD_RED_LINES, GO_CRITERIA, RETEST_WINDOW_DAYS } from '../../engine';
import type { Db } from '../db';
import { first } from '../db';

/**
 * How many people, and how many of their checks, are simulated (made by npm run seed:demo).
 * Every team response carries the count of people, so a table that includes simulated data can
 * never be read as real. Always 0 in production: the demo script refuses to run there.
 */
export async function demoCounts(db: Db): Promise<{ people: number; checks: number }> {
  const row = await first<{ people: number; checks: number }>(
    db,
    `select (select count(*) from users where is_demo)::int as people,
       (select count(*) from sessions s join users u on u.id = s.user_id where u.is_demo)::int as checks`,
  );
  return { people: row?.people ?? 0, checks: row?.checks ?? 0 };
}

export function rate(count: number, of: number): Rate {
  return { count, of, rate: of > 0 ? count / of : null };
}

/** Median of a list. null when empty. The mean of the two middle values for an even count. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const RED_LINES: TeamRedLines = { ...DASHBOARD_RED_LINES };
export const GO: TeamGoCriteria = { ...GO_CRITERIA };
export const RETEST_WINDOW = { min: RETEST_WINDOW_DAYS.min, max: RETEST_WINDOW_DAYS.max };

/**
 * SQL: one retest pair per person. Two completed checks of the same person whose completion
 * dates (UTC) are RETEST_WINDOW days apart; of all such pairs the earliest first check, and
 * for it the earliest second check. Uses $min and $max placeholders given by the caller.
 */
export function retestPairsCte(minParam: string, maxParam: string): string {
  return `
    done as (
      select s.id, s.user_id, s.role, s.completed_at, substr(s.completed_at, 1, 10)::date as day
      from sessions s where s.completed_at is not null
    ),
    pairs as (
      select distinct on (a.user_id) a.user_id, a.role, a.id as first_id, b.id as second_id
      from done a join done b
        on b.user_id = a.user_id and (b.day - a.day) between ${minParam}::int and ${maxParam}::int
      order by a.user_id, a.completed_at, a.id, b.completed_at, b.id
    )`;
}

/**
 * SQL: the result to use for each completed check: the row computed with the current algorithm
 * and norm when there is one, otherwise the newest row.
 */
export function shownResultCte(algoParam: string, normParam: string): string {
  return `
    res as (
      select distinct on (r.session_id) r.*
      from results r
      order by r.session_id, (r.algo_version = ${algoParam}::int and r.norm_version = ${normParam}) desc,
        r.computed_at desc
    )`;
}

/**
 * SQL: a derived table of (user_id, day), one row for every sign that a person used Standing
 * on a day: a visit, or an entry in one of the four micro apps on the day it was entered. A
 * person can appear more than once for a day. Use it as `from ${ACTIVITY} a`.
 */
export const ACTIVITY = `(
    select user_id, day from visits
    union all select user_id, logged_on as day from daily_entries
    union all select user_id, day from payday_entries
    union all select user_id, day from weekly_wins
    union all select user_id, day from people_nudges
  )`;

/**
 * SQL: `active`, one row per active person and day. A person is active on a day when they used
 * Standing that day (ACTIVITY) and had completed a check by then. Day 0 is the local date of
 * their first completed check, as in the return rates.
 */
export function activeCte(): string {
  return `
    checked as (
      select distinct on (s.user_id) s.user_id, s.local_day as day0
      from sessions s where s.completed_at is not null
      order by s.user_id, s.completed_at, s.id
    ),
    active as (
      select distinct a.user_id, a.day
      from ${ACTIVITY} a join checked c on c.user_id = a.user_id
      where a.day >= c.day0
    )`;
}
