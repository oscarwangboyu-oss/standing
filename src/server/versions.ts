/**
 * The version log: the day each algorithm, bank or norm version came into use (PROMPT.md
 * section 8). The chart draws a vertical line on each of those days.
 *
 * The log records changes. The versions the product started with have no row. Rows are written
 * by the recompute command (src/server/recompute.ts) when it stores results under a version
 * that is new to the database; the team can also insert a row by hand for a bank change.
 */
import { VERSION_KINDS, type VersionKind, type VersionMarker } from '../shared/api';
import { ALGOS, BANKS, NORMS } from '../engine';
import type { Db } from './db';
import { isOneOf } from './http';

interface LogRow {
  kind: string;
  version: string;
  effective_day: string;
}

/** True when the engine of this build knows the version. */
function isRegistered(kind: VersionKind, version: string): boolean {
  if (kind === 'algo') return /^\d+$/.test(version) && Object.hasOwn(ALGOS, Number(version));
  if (kind === 'bank') return Object.hasOwn(BANKS, version);
  return Object.hasOwn(NORMS, version);
}

/**
 * The markers to draw, oldest first: logged changes up to `today` whose version is registered
 * in the engine. A version tried out by a script and never released is not registered in the
 * app, so it draws no line.
 */
export async function versionMarkers(db: Db, today: string): Promise<VersionMarker[]> {
  const rows = await db.query<LogRow>(
    `select kind, version, effective_day from version_log where effective_day <= $1
     order by effective_day, kind, version`,
    [today],
  );
  const markers: VersionMarker[] = [];
  for (const row of rows) {
    if (!isOneOf(row.kind, VERSION_KINDS) || !isRegistered(row.kind, row.version)) continue;
    markers.push({ kind: row.kind, version: row.version, day: row.effective_day });
  }
  return markers;
}

/**
 * Logs that a version came into use on a day. The first day logged for a version is kept, so
 * running a command twice does not move the marker. Returns true when a row was written.
 */
export async function logVersion(db: Db, kind: VersionKind, version: string, day: string, at: string): Promise<boolean> {
  const rows = await db.query(
    `insert into version_log (kind, version, effective_day, logged_at) values ($1, $2, $3, $4)
     on conflict do nothing returning kind`,
    [kind, version, day, at],
  );
  return rows.length > 0;
}
