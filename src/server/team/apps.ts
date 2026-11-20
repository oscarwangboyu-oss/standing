/**
 * Team dashboard, stage 2: who uses the four micro apps (PROMPT.md section 7.2, last paragraph).
 *
 * - teamDaily: day by day and week by week, the share of active people who did the daily open.
 * - teamApps: for each app, the share of active people it is offered to who used it in a recent
 *   window, and week by week the share who logged a weekly win and a people nudge.
 *
 * "Active" is defined once, in activeCte of ./shared.ts: a person with a completed check who
 * opened Standing or recorded an entry that day. Days are the device's local dates as stored;
 * windows end on the server's UTC date.
 *
 * Only counts leave these functions. Payday eligibility is the engine's rule (own earnings and
 * an eligible role), so it is worked out here from the background of each active person's
 * latest check; those rows are counted and dropped.
 */
import {
  MICRO_APPS,
  type FeatureFlags,
  type MicroApp,
  type TeamAppRow,
  type TeamAppWeekRow,
  type TeamAppsResponse,
  type TeamDailyResponse,
  type TeamDailyRow,
  type TeamDailyWeekRow,
} from '../../shared/api';
import { BANKS, addDays, getBank, paydayEligible, type RoleId } from '../../engine';
import { TEAM_APP_WEEKS, TEAM_APP_WINDOW_DAYS, TEAM_DAILY_DAYS } from '../config';
import type { Db } from '../db';
import { csv, utcDay, type CsvCell } from '../http';
import { activeCte, demoCounts, mondayOf, rate } from './shared';

/** Share of active people who did the daily open, for each of the last TEAM_DAILY_DAYS days. */
export async function teamDaily(db: Db, now: Date): Promise<TeamDailyResponse> {
  const today = utcDay(now);
  const sqlRows = await db.query<{ day: string; active: number; eligible: number; done: number }>(
    `with ${activeCte()}
     select a.day, count(*)::int as active,
       (count(*) filter (where u.health_consent_version is not null))::int as eligible,
       (count(*) filter (where u.health_consent_version is not null and exists (
          select 1 from daily_entries d where d.user_id = a.user_id and d.logged_on = a.day
        )))::int as done
     from active a join users u on u.id = a.user_id
     where a.day > $1 and a.day <= $2
     group by a.day
     order by a.day`,
    [addDays(today, -TEAM_DAILY_DAYS), today],
  );
  const rows: TeamDailyRow[] = sqlRows.map((r) => ({ day: r.day, active: r.active, dailyOpen: rate(r.done, r.eligible) }));
  const total: TeamDailyRow = {
    day: 'all',
    active: rows.reduce((sum, r) => sum + r.active, 0),
    dailyOpen: rate(
      rows.reduce((sum, r) => sum + r.dailyOpen.count, 0),
      rows.reduce((sum, r) => sum + r.dailyOpen.of, 0),
    ),
  };

  // Week by week, in person-days, from the Monday of the week of the first of those days, so the
  // first week is whole. Weeks start on Monday, as in the engine.
  const weeksFrom = mondayOf(addDays(today, -(TEAM_DAILY_DAYS - 1)));
  const weekRows = await db.query<{ week_start: string; is_total: number; people: number; active: number; eligible: number; done: number }>(
    `with ${activeCte()},
     days as (
       select a.user_id, a.day, date_trunc('week', a.day::date::timestamp)::date as week,
         (u.health_consent_version is not null) as consent,
         exists (select 1 from daily_entries d where d.user_id = a.user_id and d.logged_on = a.day) as done
       from active a join users u on u.id = a.user_id
       where a.day >= $1 and a.day <= $2
     )
     select to_char(week, 'YYYY-MM-DD') as week_start, grouping(week)::int as is_total,
       count(distinct user_id)::int as people, count(*)::int as active,
       (count(*) filter (where consent))::int as eligible,
       (count(*) filter (where consent and done))::int as done
     from days
     group by grouping sets ((week), ())
     order by is_total desc, week`,
    [weeksFrom, today],
  );
  const weeks: TeamDailyWeekRow[] = weekRows.map((r) => ({
    weekStart: r.is_total === 1 ? 'all' : r.week_start,
    people: r.people,
    active: r.active,
    dailyOpen: rate(r.done, r.eligible),
  }));
  return {
    generatedAt: now.toISOString(),
    demoPeople: (await demoCounts(db)).people,
    days: TEAM_DAILY_DAYS,
    rows: [total, ...rows],
    weeksFrom,
    weeks: weeks.length > 0 ? weeks : [{ weekStart: 'all', people: 0, active: 0, dailyOpen: rate(0, 0) }],
  };
}

export function teamDailyCsv(data: TeamDailyResponse): Response {
  return csv(
    'standing-daily-open',
    ['day', 'active', 'daily_open_offered', 'daily_open_done', 'daily_open_rate'],
    data.rows.map((r): CsvCell[] => [r.day, r.active, r.dailyOpen.of, r.dailyOpen.count, r.dailyOpen.rate]),
  );
}

const FLAG_OF: Record<MicroApp, keyof FeatureFlags> = {
  daily_open: 'dailyOpen',
  payday: 'payday',
  weekly_win: 'weeklyWin',
  people_nudge: 'peopleNudge',
};

/** Table, and the column holding the day an entry was made on, of each app. Fixed here, never request input. */
const ENTRIES_OF: Record<MicroApp, { table: string; day: string }> = {
  daily_open: { table: 'daily_entries', day: 'logged_on' },
  payday: { table: 'payday_entries', day: 'day' },
  weekly_win: { table: 'weekly_wins', day: 'day' },
  people_nudge: { table: 'people_nudges', day: 'day' },
};

interface ActivePersonRow {
  age: number;
  role: RoleId;
  extra: Record<string, number>;
  bank_version: string;
  health: boolean;
  used: boolean;
}

async function summaryRow(db: Db, app: MicroApp, today: string, flags: FeatureFlags): Promise<TeamAppRow> {
  const windowDays = TEAM_APP_WINDOW_DAYS[app];
  const from = addDays(today, -windowDays);
  const { table, day } = ENTRIES_OF[app];
  // One row per person active in the window, with the background of their latest check.
  const people = await db.query<ActivePersonRow>(
    `with ${activeCte()},
     recent as (select distinct user_id from active where day > $1 and day <= $2)
     select distinct on (s.user_id) s.age, s.role, s.extra, s.bank_version,
       (u.health_consent_version is not null) as health,
       exists (select 1 from ${table} e where e.user_id = s.user_id and e.${day} > $1 and e.${day} <= $2) as used
     from recent r join sessions s on s.user_id = r.user_id join users u on u.id = r.user_id
     where s.completed_at is not null
     order by s.user_id, s.completed_at desc, s.id desc`,
    [from, today],
  );
  const offered = people.filter((p) => {
    if (app === 'daily_open') return p.health;
    if (app !== 'payday') return true;
    if (!Object.hasOwn(BANKS, p.bank_version)) return false;
    // One stored background the engine cannot read must not take the whole table down.
    try {
      return paydayEligible(getBank(p.bank_version), { age: p.age, role: p.role, extra: p.extra });
    } catch {
      return false;
    }
  });
  const entries = await db.query<{ n: number }>(
    `select count(*)::int as n from ${table} where ${day} > $1 and ${day} <= $2`,
    [from, today],
  );
  return {
    app,
    enabled: flags[FLAG_OF[app]],
    windowDays,
    active: people.length,
    participated: rate(offered.filter((p) => p.used).length, offered.length),
    entries: entries[0]?.n ?? 0,
  };
}

/** Use of the four micro apps in a recent window, and the weekly apps week by week. */
export async function teamApps(db: Db, now: Date, flags: FeatureFlags): Promise<TeamAppsResponse> {
  const today = utcDay(now);
  const summary: TeamAppRow[] = [];
  for (const app of MICRO_APPS) summary.push(await summaryRow(db, app, today, flags));

  // Calendar weeks start on Monday, as in the engine. date_trunc('week') does the same.
  const weekRows = await db.query<{ week_start: string; active: number; wins: number; nudges: number }>(
    `with ${activeCte()},
     weeks as (select distinct user_id, date_trunc('week', day::date)::date as week from active where day <= $1),
     wins as (select distinct user_id, date_trunc('week', day::date)::date as week from weekly_wins),
     nudges as (select distinct user_id, date_trunc('week', day::date)::date as week from people_nudges)
     select to_char(w.week, 'YYYY-MM-DD') as week_start, count(*)::int as active,
       count(wi.user_id)::int as wins, count(n.user_id)::int as nudges
     from weeks w
     left join wins wi on wi.user_id = w.user_id and wi.week = w.week
     left join nudges n on n.user_id = w.user_id and n.week = w.week
     where w.week > $1::date - ${TEAM_APP_WEEKS * 7}
     group by w.week
     order by w.week`,
    [today],
  );
  const weeks: TeamAppWeekRow[] = weekRows.map((r) => ({
    weekStart: r.week_start,
    active: r.active,
    weeklyWin: rate(r.wins, r.active),
    peopleNudge: rate(r.nudges, r.active),
  }));
  return { generatedAt: now.toISOString(), demoPeople: (await demoCounts(db)).people, summary, weeks };
}

/** `table=summary` gives the per-app summary; the default is the week-by-week table. */
export function teamAppsCsv(data: TeamAppsResponse, table: string | null): Response {
  if (table === 'summary') {
    return csv(
      'standing-micro-apps',
      ['app', 'enabled', 'window_days', 'active', 'offered', 'participated', 'rate', 'entries'],
      data.summary.map((r): CsvCell[] => [
        r.app,
        r.enabled,
        r.windowDays,
        r.active,
        r.participated.of,
        r.participated.count,
        r.participated.rate,
        r.entries,
      ]),
    );
  }
  return csv(
    'standing-weekly-apps',
    ['week_start', 'active', 'weekly_win_people', 'weekly_win_rate', 'people_nudge_people', 'people_nudge_rate'],
    data.weeks.map((r): CsvCell[] => [
      r.weekStart,
      r.active,
      r.weeklyWin.count,
      r.weeklyWin.rate,
      r.peopleNudge.count,
      r.peopleNudge.rate,
    ]),
  );
}
