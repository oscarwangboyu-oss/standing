/**
 * Team dashboard: started, completed, completion rate, counts by role, the retest correlation
 * of the overall price, and the go criteria with their current values.
 */
import type { TeamOverviewResponse, TeamStartedCompleted } from '../../shared/api';
import { CURRENT, ROLE_IDS, type RoleId } from '../../engine';
import type { Db } from '../db';
import { first } from '../db';
import { csv, type CsvCell } from '../http';
import { teamItems } from './items';
import { demoCounts, GO, rate, RED_LINES, RETEST_WINDOW, retestPairsCte, shownResultCte } from './shared';

interface StartedRow {
  role: RoleId | null;
  is_total: number;
  sessions_started: number;
  sessions_completed: number;
  people_started: number;
  people_completed: number;
}

function startedCompleted(row: StartedRow | undefined): TeamStartedCompleted {
  return {
    sessions: rate(row?.sessions_completed ?? 0, row?.sessions_started ?? 0),
    people: rate(row?.people_completed ?? 0, row?.people_started ?? 0),
  };
}

export async function teamOverview(db: Db, now: Date): Promise<TeamOverviewResponse> {
  // "People" are distinct users: someone who takes the check twice counts once.
  const started = await db.query<StartedRow>(
    `select role, grouping(role)::int as is_total,
       count(*)::int as sessions_started,
       count(completed_at)::int as sessions_completed,
       count(distinct user_id)::int as people_started,
       (count(distinct user_id) filter (where completed_at is not null))::int as people_completed
     from sessions
     group by grouping sets ((role), ())`,
  );
  const totals = startedCompleted(started.find((r) => r.is_total === 1));
  const byRole = ROLE_IDS.flatMap((role) => {
    const row = started.find((r) => r.is_total === 0 && r.role === role);
    return row ? [{ role, ...startedCompleted(row) }] : [];
  });

  const retest = await first<{ pairs: number; correlation: number | null }>(
    db,
    `with ${retestPairsCte('$3', '$4')}, ${shownResultCte('$1', '$2')}
     select count(*)::int as pairs, corr(ra.overall, rb.overall)::float8 as correlation
     from pairs p
     join res ra on ra.session_id = p.first_id
     join res rb on rb.session_id = p.second_id
     where ra.overall is not null and rb.overall is not null`,
    [CURRENT.algo, CURRENT.norm, RETEST_WINDOW.min, RETEST_WINDOW.max],
  );
  const pairs = retest?.pairs ?? 0;
  const correlation = retest?.correlation ?? null;

  const demo = await demoCounts(db);

  // Highest skip rate of any question version, over all roles.
  const items = await teamItems(db, now, null);
  // On a tie the version seen by more checks wins: its share is the firmer one.
  let worst: { value: number; itemId: string; versionKey: string; count: number; of: number } | null = null;
  for (const row of items.rows) {
    if (row.skip.rate === null) continue;
    if (worst === null || row.skip.rate > worst.value || (row.skip.rate === worst.value && row.skip.of > worst.of)) {
      worst = { value: row.skip.rate, itemId: row.itemId, versionKey: row.versionKey, count: row.skip.count, of: row.skip.of };
    }
  }

  const completion = totals.people;
  return {
    generatedAt: now.toISOString(),
    versions: { ...CURRENT },
    demoPeople: demo.people,
    demoChecks: demo.checks,
    totals,
    byRole,
    retest: { pairs, correlation, windowDays: RETEST_WINDOW },
    goCriteria: GO,
    status: {
      completionRate: { ...completion, met: completion.rate === null ? null : completion.rate >= GO.completionRate },
      maxItemSkipRate: {
        value: worst?.value ?? null,
        itemId: worst?.itemId ?? null,
        versionKey: worst?.versionKey ?? null,
        count: worst?.count ?? null,
        of: worst?.of ?? null,
        met: worst === null ? null : worst.value <= GO.maxItemSkipRate,
      },
      retestCorrelation: {
        value: correlation,
        pairs,
        met: correlation === null ? null : correlation >= GO.retestCorrelation,
      },
    },
    redLines: RED_LINES,
  };
}

/** `table=status` gives the go criteria; the default is the started and completed table. */
export function teamOverviewCsv(data: TeamOverviewResponse, table: string | null): Response {
  if (table === 'status') {
    const s = data.status;
    const rows: CsvCell[][] = [
      ['completion_rate_people', s.completionRate.rate, s.completionRate.count, s.completionRate.of, data.goCriteria.completionRate, s.completionRate.met],
      ['max_item_skip_rate', s.maxItemSkipRate.value, s.maxItemSkipRate.count, s.maxItemSkipRate.of, data.goCriteria.maxItemSkipRate, s.maxItemSkipRate.met],
      ['retest_correlation', s.retestCorrelation.value, s.retestCorrelation.pairs, null, data.goCriteria.retestCorrelation, s.retestCorrelation.met],
    ];
    return csv('standing-go-criteria', ['metric', 'value', 'count', 'of', 'criterion', 'met'], rows);
  }
  const line = (role: string, r: TeamStartedCompleted): CsvCell[] => [
    role,
    r.sessions.of, r.sessions.count, r.sessions.rate,
    r.people.of, r.people.count, r.people.rate,
  ];
  return csv(
    'standing-overview',
    ['role', 'checks_started', 'checks_completed', 'check_completion_rate', 'people_started', 'people_completed', 'people_completion_rate'],
    [line('all', data.totals), ...data.byRole.map((r) => line(r.role, r))],
  );
}
