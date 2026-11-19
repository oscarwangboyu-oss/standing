/**
 * Re-scoring all history with a chosen algorithm and norm version (PROMPT.md section 8).
 *
 * The raw records are never touched. Every completed check is rebuilt from its stored question
 * events and scored again, and the new overall price is set against the stored one. With
 * `write` the new results are stored next to the old ones under their own version key (a row
 * that exists is never overwritten) and the version change is logged for the chart.
 *
 * recompute() takes a Db and a clock and nothing else, so it runs the same against the
 * embedded database, Supabase and a test database. scripts/recompute.ts is the command.
 *
 * What the report compares
 * - "old" is the stored result of a check under the versions in force (CURRENT). When a check
 *   has no such row, its newest row under any version other than the target is used.
 * - "new" is the result under the target versions, computed now. Checks of one person are
 *   scored in order, so the top gainer and top loser of each new result refer to the new
 *   prices of the check before it.
 * - Rank correlation: Spearman's coefficient of the overall price over all checks that have an
 *   overall price both old and new. Ties get the mean of their ranks.
 * - People moved: for each person their latest compared check; the share whose overall price
 *   moves by more than RECOMPUTE_MOVE_POINTS.
 */
import type { Rate, VersionMarker } from '../shared/api';
import {
  BANKS,
  CURRENT,
  RECOMPUTE_MOVE_POINTS,
  compute,
  getAlgo,
  getBank,
  getNorm,
  type PreviousPrices,
  type Result,
} from '../engine';
import { RECOMPUTE_TOP_MOVES } from './config';
import type { Db } from './db';
import { first } from './db';
import { utcDay } from './http';
import { backgroundOf, excludedAreasOf, insertResult, stepsOf, type EventRow, type SessionRow } from './sessions';
import { logVersion } from './versions';

export interface RecomputeOptions {
  /** Algorithm version to score with. Must be registered in the engine. */
  algo: number;
  /** Norm version to score with. Defaults to the norm in force. */
  norm?: string;
  /** Store the new results and log the version change. Default false: compare only. */
  write?: boolean;
  now: Date;
  /** Day the version change takes effect on the chart. Defaults to the UTC day of `now`. */
  effectiveDay?: string;
  /** A move above this many points counts as moved. Defaults to RECOMPUTE_MOVE_POINTS. */
  movePoints?: number;
  /** How many of the largest moves to list. */
  topMoves?: number;
}

export interface RecomputeMove {
  sessionId: string;
  completedAt: string;
  oldOverall: number;
  newOverall: number;
  /** New minus old. */
  delta: number;
}

export interface RecomputeReport {
  /** Versions the old results were read under, and the versions scored now. */
  current: { algo: number; norm: string };
  target: { algo: number; norm: string };
  /** Completed checks found. */
  sessions: number;
  people: number;
  /** People flagged as simulated among them. Above 0 the numbers include demo data. */
  demoPeople: number;
  /** Checks scored again without an error. */
  rescored: number;
  /** Checks the engine could not score, for example a bank version that is no longer registered. */
  failed: Array<{ sessionId: string; message: string }>;
  /** Checks with an overall price both old and new. Everything below is over these. */
  compared: number;
  /** Checks without a stored result to compare with. */
  withoutOld: number;
  /** Checks with a result on both sides where one of the two has no overall price. */
  withoutOverall: number;
  /** Spearman rank correlation of the overall price, old against new. null below 2 checks or without spread. */
  rankCorrelation: number | null;
  meanAbsoluteMove: number | null;
  moved: {
    /** The threshold in points. */
    points: number;
    /** Compared checks that moved by more than the threshold. */
    sessions: Rate;
    /** People whose latest compared check moved by more than the threshold. */
    people: Rate;
  };
  /** The largest moves, largest first. */
  largestMoves: RecomputeMove[];
  /** True when the run was asked to store results. */
  wrote: boolean;
  /** Result rows stored by this run. */
  written: number;
  /** Checks that already had a row under the target versions. Those rows were left as they were. */
  alreadyStored: number;
  /** Version changes logged by this run. */
  logged: VersionMarker[];
}

type SessionWithDemo = SessionRow & { is_demo: boolean };
type EventWithSession = EventRow & { session_id: string };

interface OldRow {
  session_id: string;
  overall: number | null;
  algo_version: number;
  norm_version: string;
}

/** Checks whose events are loaded in one query. */
const CHUNK = 200;

function rate(count: number, of: number): Rate {
  return { count, of, rate: of > 0 ? count / of : null };
}

/** Ranks from 1, ties get the mean of the ranks they span. */
export function ranksOf(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const mean = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = mean;
    i = j + 1;
  }
  return ranks;
}

/** Spearman's rank correlation. null below two pairs or when one side has no spread. */
export function rankCorrelation(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ra = ranksOf(a.slice(0, n));
  const rb = ranksOf(b.slice(0, n));
  const mean = (n + 1) / 2;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    sab += (ra[i] - mean) * (rb[i] - mean);
    saa += (ra[i] - mean) ** 2;
    sbb += (rb[i] - mean) ** 2;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

function pricesOfResult(result: Result): PreviousPrices {
  return {
    C: result.sectors.C.price,
    W: result.sectors.W.price,
    N: result.sectors.N.price,
    B: result.sectors.B.price,
    M: result.sectors.M.price,
  };
}

async function loadEventsOf(db: Db, sessionIds: readonly string[]): Promise<Map<string, EventRow[]>> {
  const rows = await db.query<EventWithSession>(
    `select session_id, seq, action, item_id, version_key, lang, option_index, seconds, display_direction, click_position
     from question_events
     where session_id in (select jsonb_array_elements_text($1::jsonb))
     order by session_id, seq, case action when 'shown' then 0 else 1 end`,
    [JSON.stringify(sessionIds)],
  );
  const bySession = new Map<string, EventRow[]>();
  for (const row of rows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }
  return bySession;
}

/**
 * Scores every completed check again with the chosen versions and compares the overall price
 * with the stored one. Reads only, unless `write` is set.
 */
export async function recompute(db: Db, options: RecomputeOptions): Promise<RecomputeReport> {
  const target = { algo: options.algo, norm: options.norm ?? CURRENT.norm };
  // Both throw an EngineError for a version that is not registered, before anything is read.
  getAlgo(target.algo);
  getNorm(target.norm);
  const movePoints = options.movePoints ?? RECOMPUTE_MOVE_POINTS;
  const at = options.now.toISOString();
  const sameAsCurrent = target.algo === CURRENT.algo && target.norm === CURRENT.norm;

  // One person's checks together, oldest first.
  const sessions = await db.query<SessionWithDemo>(
    `select s.id, s.user_id, s.created_at, s.completed_at, s.local_day, s.age, s.role, s.extra, s.us_state, s.ticker,
       s.lang, s.bank_version, s.health_consent, u.is_demo
     from sessions s join users u on u.id = s.user_id
     where s.completed_at is not null
     order by s.user_id, s.completed_at, s.id`,
  );

  // The stored result to compare with: the row under the versions in force, otherwise the
  // newest row that is not under the target versions.
  const oldRows = await db.query<OldRow>(
    `select distinct on (r.session_id) r.session_id, r.overall, r.algo_version, r.norm_version
     from results r
     order by r.session_id,
       (r.algo_version = $1 and r.norm_version = $2) desc,
       (r.algo_version = $3 and r.norm_version = $4) asc,
       r.computed_at desc`,
    [CURRENT.algo, CURRENT.norm, target.algo, target.norm],
  );
  const oldBy = new Map<string, OldRow>();
  for (const row of oldRows) {
    const isTarget = row.algo_version === target.algo && row.norm_version === target.norm;
    // A check that only has a row under the target versions has nothing older to compare with.
    if (!isTarget || sameAsCurrent) oldBy.set(row.session_id, row);
  }

  // Whether the target versions are new to this database decides what gets logged.
  const algoKnown = await first(db, 'select 1 as x from results where algo_version = $1 limit 1', [target.algo]);
  const normKnown = await first(db, 'select 1 as x from results where norm_version = $1 limit 1', [target.norm]);

  const report: RecomputeReport = {
    current: { algo: CURRENT.algo, norm: CURRENT.norm },
    target,
    sessions: sessions.length,
    people: new Set(sessions.map((s) => s.user_id)).size,
    demoPeople: new Set(sessions.filter((s) => s.is_demo).map((s) => s.user_id)).size,
    rescored: 0,
    failed: [],
    compared: 0,
    withoutOld: 0,
    withoutOverall: 0,
    rankCorrelation: null,
    meanAbsoluteMove: null,
    moved: { points: movePoints, sessions: rate(0, 0), people: rate(0, 0) },
    largestMoves: [],
    wrote: options.write === true,
    written: 0,
    alreadyStored: 0,
    logged: [],
  };

  const moves: Array<RecomputeMove & { userId: string }> = [];
  let previousUser: string | null = null;
  let previous: PreviousPrices | null = null;

  for (let start = 0; start < sessions.length; start += CHUNK) {
    const chunk = sessions.slice(start, start + CHUNK);
    const events = await loadEventsOf(db, chunk.map((s) => s.id));
    const scored: Array<{ session: SessionWithDemo; result: Result }> = [];

    for (const session of chunk) {
      if (session.user_id !== previousUser) {
        previousUser = session.user_id;
        previous = null;
      }
      let result: Result;
      try {
        if (!Object.hasOwn(BANKS, session.bank_version)) {
          throw new Error(`bank version "${session.bank_version}" is not registered`);
        }
        result = compute({
          bank: getBank(session.bank_version),
          background: backgroundOf(session),
          steps: stepsOf(events.get(session.id) ?? []),
          excludedAreas: excludedAreasOf(session),
          previous,
          versions: target,
        });
      } catch (error) {
        report.failed.push({ sessionId: session.id, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      report.rescored += 1;
      previous = pricesOfResult(result);
      scored.push({ session, result });

      const old = oldBy.get(session.id);
      if (!old) {
        report.withoutOld += 1;
      } else if (old.overall === null || result.overall === null) {
        report.withoutOverall += 1;
      } else {
        moves.push({
          sessionId: session.id,
          userId: session.user_id,
          completedAt: session.completed_at as string,
          oldOverall: old.overall,
          newOverall: result.overall,
          delta: result.overall - old.overall,
        });
      }
    }

    if (options.write && scored.length > 0) {
      await db.transaction(async (tx) => {
        for (const { session, result } of scored) {
          if (await insertResult(tx, session.id, session.user_id, at, result)) report.written += 1;
          else report.alreadyStored += 1;
        }
      });
    }
  }

  report.compared = moves.length;
  if (moves.length > 0) {
    report.rankCorrelation = rankCorrelation(
      moves.map((m) => m.oldOverall),
      moves.map((m) => m.newOverall),
    );
    report.meanAbsoluteMove = moves.reduce((sum, m) => sum + Math.abs(m.delta), 0) / moves.length;
  }
  report.moved.sessions = rate(moves.filter((m) => Math.abs(m.delta) > movePoints).length, moves.length);
  // Checks come ordered by person and time, so the last move seen for a person is their latest.
  const latestByPerson = new Map<string, RecomputeMove>();
  for (const move of moves) latestByPerson.set(move.userId, move);
  report.moved.people = rate(
    [...latestByPerson.values()].filter((m) => Math.abs(m.delta) > movePoints).length,
    latestByPerson.size,
  );
  report.largestMoves = [...moves]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.sessionId.localeCompare(b.sessionId))
    .slice(0, options.topMoves ?? RECOMPUTE_TOP_MOVES)
    .map(({ userId: _userId, ...move }) => move);

  if (options.write && report.written > 0) {
    const day = options.effectiveDay ?? utcDay(options.now);
    if (!algoKnown && (await logVersion(db, 'algo', String(target.algo), day, at))) {
      report.logged.push({ kind: 'algo', version: String(target.algo), day });
    }
    if (!normKnown && (await logVersion(db, 'norm', target.norm, day, at))) {
      report.logged.push({ kind: 'norm', version: target.norm, day });
    }
  }
  return report;
}

const fixed = (value: number | null, digits: number): string => (value === null ? 'n/a' : value.toFixed(digits));
const share = (r: Rate): string => `${r.count} of ${r.of}${r.rate === null ? '' : ` (${(r.rate * 100).toFixed(1)}%)`}`;

/** The report as the command prints it. Plain text, counts next to every share. */
export function formatRecomputeReport(report: RecomputeReport): string {
  const lines: string[] = [];
  lines.push(
    `Re-score: algorithm ${report.current.algo}, norm ${report.current.norm} (stored)` +
      ` against algorithm ${report.target.algo}, norm ${report.target.norm} (computed now)`,
  );
  if (report.demoPeople > 0) {
    lines.push(`SIMULATED DATA: ${report.demoPeople} of ${report.people} people are demo rows. These numbers are not real.`);
  }
  lines.push(`Completed checks: ${report.sessions} from ${report.people} people`);
  lines.push(`Scored again: ${report.rescored}. Could not be scored: ${report.failed.length}`);
  lines.push(
    `Compared (overall price old and new): ${report.compared}.` +
      ` No stored result: ${report.withoutOld}. No overall price on one side: ${report.withoutOverall}`,
  );
  lines.push(`Rank correlation of the overall price (Spearman): ${fixed(report.rankCorrelation, 4)}`);
  lines.push(`Mean absolute move: ${fixed(report.meanAbsoluteMove, 2)} points`);
  lines.push(`People moving more than ${report.moved.points} points (latest check): ${share(report.moved.people)}`);
  lines.push(`Checks moving more than ${report.moved.points} points: ${share(report.moved.sessions)}`);
  if (report.largestMoves.length > 0) {
    lines.push('Largest moves (check, completed, old, new, change):');
    for (const move of report.largestMoves) {
      const sign = move.delta > 0 ? '+' : '';
      lines.push(
        `  ${move.sessionId}  ${move.completedAt.slice(0, 10)}  ${move.oldOverall.toFixed(2)}  ${move.newOverall.toFixed(2)}  ${sign}${move.delta.toFixed(2)}`,
      );
    }
  }
  for (const failure of report.failed.slice(0, 10)) lines.push(`  not scored: ${failure.sessionId}: ${failure.message}`);
  if (report.wrote) {
    lines.push(`Stored: ${report.written} new result rows. Already stored and left as they were: ${report.alreadyStored}`);
    lines.push(
      report.logged.length > 0
        ? `Version log: ${report.logged.map((m) => `${m.kind} ${m.version} from ${m.day}`).join(', ')}`
        : 'Version log: nothing new',
    );
  } else {
    lines.push('Nothing was stored. Add --write to store the new results next to the old ones.');
  }
  return lines.join('\n');
}
