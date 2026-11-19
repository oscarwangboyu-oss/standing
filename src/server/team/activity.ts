/**
 * Team dashboard: return rates from the visits table, and how the result page is read.
 */
import {
  REPORT_SECTIONS,
  type ReportSection,
  type TeamReportResponse,
  type TeamReportRow,
  type TeamReturnRow,
  type TeamReturnsResponse,
} from '../../shared/api';
import { RETURN_RATE_DAYS } from '../../engine';
import type { Db } from '../db';
import { csv, utcDay, type CsvCell } from '../http';
import { rate } from './shared';

type ReturnSqlRow = { first_day: string; people: number } & Record<string, number | string>;

/**
 * Return rates by the date of the first check.
 *
 * Day 0 is the local date on which a person started their first completed check. They
 * "returned on day N" when the visits table has a row for day 0 plus N. A person enters the
 * denominator of day N once that day is over everywhere in the US: two UTC dates later.
 */
export async function teamReturns(db: Db, now: Date): Promise<TeamReturnsResponse> {
  const days = [...RETURN_RATE_DAYS];
  // The day offsets are numbers from config, never request input.
  const columns = days
    .map(
      (n) => `
       (count(*) filter (where f.day0 + ${n} + 1 < $1::date))::int as eligible_${n},
       (count(*) filter (where f.day0 + ${n} + 1 < $1::date and exists (
          select 1 from visits v where v.user_id = f.user_id and v.day = to_char(f.day0 + ${n}, 'YYYY-MM-DD')
        )))::int as returned_${n}`,
    )
    .join(',');
  const sqlRows = await db.query<ReturnSqlRow>(
    `with firsts as (
       select distinct on (s.user_id) s.user_id, s.local_day::date as day0
       from sessions s where s.completed_at is not null
       order by s.user_id, s.completed_at, s.id
     )
     select to_char(f.day0, 'YYYY-MM-DD') as first_day, count(*)::int as people,${columns}
     from firsts f
     group by f.day0
     order by f.day0`,
    [utcDay(now)],
  );

  const rows: TeamReturnRow[] = sqlRows.map((r) => ({
    firstDay: r.first_day,
    people: r.people,
    returns: days.map((n) => ({ day: n, ...rate(Number(r[`returned_${n}`]), Number(r[`eligible_${n}`])) })),
  }));
  const total: TeamReturnRow = {
    firstDay: 'all',
    people: rows.reduce((sum, r) => sum + r.people, 0),
    returns: days.map((n, i) => ({
      day: n,
      ...rate(
        rows.reduce((sum, r) => sum + r.returns[i].count, 0),
        rows.reduce((sum, r) => sum + r.returns[i].of, 0),
      ),
    })),
  };
  return { generatedAt: now.toISOString(), returnDays: days, rows: [total, ...rows] };
}

export function teamReturnsCsv(data: TeamReturnsResponse): Response {
  const header = [
    'first_day',
    'people',
    ...data.returnDays.flatMap((n) => [`day${n}_eligible`, `day${n}_returned`, `day${n}_rate`]),
  ];
  const rows = data.rows.map((r): CsvCell[] => [
    r.firstDay,
    r.people,
    ...r.returns.flatMap((x): CsvCell[] => [x.of, x.count, x.rate]),
  ]);
  return csv('standing-returns', header, rows);
}

interface ReportSqlRow {
  section: string;
  seen: number;
  median_dwell_ms: number | null;
  dwell_events: number;
  shares: number;
}

/**
 * How the result page is read. "seen" counts result pages (a person and a check), so opening
 * the same result twice counts once. "useful" takes the last click of each person and check.
 */
export async function teamReport(db: Db, now: Date): Promise<TeamReportResponse> {
  const counts = await db.query<ReportSqlRow>(
    `select section,
       (count(distinct (user_id, session_id)) filter (where kind = 'seen'))::int as seen,
       (percentile_cont(0.5) within group (order by ms::float8) filter (where kind = 'dwell'))::float8 as median_dwell_ms,
       (count(*) filter (where kind = 'dwell'))::int as dwell_events,
       (count(*) filter (where kind = 'share'))::int as shares
     from report_events
     group by section`,
  );
  const useful = await db.query<{ section: string; useful: number; not_useful: number }>(
    `select section,
       (count(*) filter (where useful))::int as useful,
       (count(*) filter (where not useful))::int as not_useful
     from (
       select distinct on (user_id, session_id, section) section, useful
       from report_events where kind = 'useful'
       order by user_id, session_id, section, at desc, id desc
     ) last_click
     group by section`,
  );
  const rows: TeamReportRow[] = REPORT_SECTIONS.map((section: ReportSection) => {
    const c = counts.find((r) => r.section === section);
    const u = useful.find((r) => r.section === section);
    return {
      section,
      seen: c?.seen ?? 0,
      medianDwellMs: c?.median_dwell_ms ?? null,
      dwellEvents: c?.dwell_events ?? 0,
      shares: c?.shares ?? 0,
      useful: u?.useful ?? 0,
      notUseful: u?.not_useful ?? 0,
    };
  });
  return { generatedAt: now.toISOString(), rows };
}

export function teamReportCsv(data: TeamReportResponse): Response {
  return csv(
    'standing-report-sections',
    ['section', 'seen', 'median_dwell_ms', 'dwell_events', 'shares', 'useful', 'not_useful'],
    data.rows.map((r) => [r.section, r.seen, r.medianDwellMs, r.dwellEvents, r.shares, r.useful, r.notUseful]),
  );
}
