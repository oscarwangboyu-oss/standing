/**
 * Team dashboard: the go or no-go gates between stages, next to the numbers the data gives.
 *
 * The gates come from the roadmap deck: stage 1 moves on at 70% finish, no question skipped by
 * over 10%, retest 0.75 or more; stage 2 moves on at 25% back on day 7 and 12% on day 30. The
 * brief adds one for the payday check: half of the active people it is offered to reconcile.
 * The values live in GO_CRITERIA of src/engine/config.ts. Every actual number is read from the
 * table that owns it, so a gate can never disagree with its table.
 */
import type { FeatureFlags, Rate, TeamGate, TeamGatesResponse } from '../../shared/api';
import type { Db } from '../db';
import { csv, type CsvCell } from '../http';
import { teamReturns } from './activity';
import { teamApps } from './apps';
import { teamOverview } from './overview';
import { GO } from './shared';

const atLeast = (value: number | null, criterion: number): boolean | null => (value === null ? null : value >= criterion);

export async function teamGates(db: Db, now: Date, flags: FeatureFlags): Promise<TeamGatesResponse> {
  const overview = await teamOverview(db, now);
  const returns = await teamReturns(db, now);
  const apps = await teamApps(db, now, flags);
  const status = overview.status;
  const all = returns.rows.find((r) => r.firstDay === 'all');
  const returnOn = (day: number): Rate => {
    const found = all?.returns.find((r) => r.day === day);
    return found ? { count: found.count, of: found.of, rate: found.rate } : { count: 0, of: 0, rate: null };
  };
  const day7 = returnOn(7);
  const day30 = returnOn(30);
  const payday = apps.summary.find((r) => r.app === 'payday')?.participated ?? { count: 0, of: 0, rate: null };
  const skip = status.maxItemSkipRate;

  const gates: TeamGate[] = [
    {
      id: 'completion_rate',
      stage: 1,
      from: 'deck',
      criterion: GO.completionRate,
      direction: 'at_least',
      value: status.completionRate.rate,
      count: status.completionRate.count,
      of: status.completionRate.of,
      met: status.completionRate.met,
      note: null,
    },
    {
      id: 'max_item_skip_rate',
      stage: 1,
      from: 'deck',
      criterion: GO.maxItemSkipRate,
      direction: 'at_most',
      value: skip.value,
      count: null,
      of: null,
      met: skip.met,
      note: skip.itemId === null ? null : `${skip.itemId}/${skip.versionKey ?? ''}`,
    },
    {
      id: 'retest_correlation',
      stage: 1,
      from: 'deck',
      criterion: GO.retestCorrelation,
      direction: 'at_least',
      value: status.retestCorrelation.value,
      count: status.retestCorrelation.pairs,
      of: null,
      met: status.retestCorrelation.met,
      note: null,
    },
    {
      id: 'day7_return',
      stage: 2,
      from: 'deck',
      criterion: GO.dailyOpenDay7Return,
      direction: 'at_least',
      value: day7.rate,
      count: day7.count,
      of: day7.of,
      met: atLeast(day7.rate, GO.dailyOpenDay7Return),
      note: null,
    },
    {
      id: 'day30_return',
      stage: 2,
      from: 'deck',
      criterion: GO.dailyOpenDay30Return,
      direction: 'at_least',
      value: day30.rate,
      count: day30.count,
      of: day30.of,
      met: atLeast(day30.rate, GO.dailyOpenDay30Return),
      note: null,
    },
    {
      id: 'payday_share',
      stage: 2,
      from: 'brief',
      criterion: GO.paydayCompletionShare,
      direction: 'at_least',
      value: payday.rate,
      count: payday.count,
      of: payday.of,
      met: atLeast(payday.rate, GO.paydayCompletionShare),
      note: null,
    },
  ];
  return { generatedAt: now.toISOString(), demoPeople: overview.demoPeople, gates };
}

export function teamGatesCsv(data: TeamGatesResponse): Response {
  return csv(
    'standing-gates',
    ['gate', 'stage', 'from', 'direction', 'criterion', 'value', 'count', 'of', 'met', 'note'],
    data.gates.map((g): CsvCell[] => [g.id, g.stage, g.from, g.direction, g.criterion, g.value, g.count, g.of, g.met, g.note]),
  );
}
