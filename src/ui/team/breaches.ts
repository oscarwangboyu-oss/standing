/**
 * The red lines a question version is over, in words and figures, and the order the dashboard
 * lists versions in: most breaches first. The server decides what is red (src/server/team/items.ts);
 * this file only reads its flags.
 */
import { team as copy } from '@/copy/team';
import type { TeamItemRow, TeamRedLines } from '@/shared/api';
import { pct } from './parts';

export type BreachMetric = 'skip' | 'dropOff' | 'time' | 'options' | 'notApplicable' | 'retest';

export interface Breach {
  metric: BreachMetric;
  /** The breach in a few words: "Skip rate 12.7%", "Uneven option spread". */
  label: string;
  /** What it rests on: "46 of 362", "One option at 95.0% of 296 answered". */
  basis: string;
}

/** Every line this version is over, in table column order. */
export function breachesOf(row: TeamItemRow, lines: TeamRedLines): Breach[] {
  const out: Breach[] = [];
  const of = copy.common.of;
  const share = (name: string, value: number | null) => `${name} ${pct(value)}`;
  if (row.skip.red) out.push({ metric: 'skip', label: share(copy.items.skip, row.skip.rate), basis: of(row.skip.count, row.skip.of) });
  if (row.dropOff.red) out.push({ metric: 'dropOff', label: share(copy.items.dropOff, row.dropOff.rate), basis: of(row.dropOff.count, row.dropOff.of) });
  if (row.time.red && row.time.medianSeconds !== null) {
    out.push({
      metric: 'time',
      label: `${copy.items.time} ${copy.items.seconds(row.time.medianSeconds.toFixed(1))}`,
      basis: copy.items.breach.similar((row.time.similarMedianSeconds ?? 0).toFixed(1)),
    });
  }
  if (row.options.red) {
    const shares = row.options.shares.filter((s): s is number => s !== null);
    const high = Math.max(...shares);
    const past = high > lines.optionShareMax ? high : Math.min(...shares);
    out.push({ metric: 'options', label: copy.items.breach.options, basis: copy.items.breach.option(pct(past), row.answered) });
  }
  if (row.notApplicable.red) {
    const na = row.notApplicable;
    out.push({ metric: 'notApplicable', label: share(copy.items.notApplicable, na.rate), basis: of(na.count, na.of) });
  }
  if (row.retest.red) {
    out.push({ metric: 'retest', label: share(copy.items.retest, row.retest.rate), basis: copy.items.breach.pairs(row.retest.count, row.retest.of) });
  }
  return out;
}

export const breachCount = (row: TeamItemRow): number =>
  [row.skip.red, row.dropOff.red, row.time.red, row.options.red, row.notApplicable.red, row.retest.red].filter(Boolean).length;

export const isRed = (row: TeamItemRow): boolean => breachCount(row) > 0;

/** Most breaches first, then the version shown to more checks, then the order of the server (the questionnaire). */
export function byBreaches(rows: readonly TeamItemRow[]): TeamItemRow[] {
  return rows
    .map((row, index) => ({ row, index, n: breachCount(row) }))
    .sort((a, b) => b.n - a.n || b.row.shown - a.row.shown || a.index - b.index)
    .map((entry) => entry.row);
}

/** The id of a row of the question table, for links to it. */
export const itemAnchor = (row: Pick<TeamItemRow, 'itemId' | 'versionKey'>): string => `team-item-${row.itemId}-${row.versionKey}`;
