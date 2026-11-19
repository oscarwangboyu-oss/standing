/**
 * Team dashboard: the seven scoring tests over the data in the database: range, stability,
 * response, validity, fairness, gaming, version effect. The tests themselves are pure functions
 * in src/engine/evaluation.ts. This file loads what they read and calls them. The dashboard
 * (GET /api/team/tests) and the command (npm run eval) share it.
 *
 * What each test is given
 * - range, validity, fairness, gaming: one record per completed check, with the result the
 *   app shows for it (the versions in force when such a row exists, otherwise the newest).
 * - stability: one pair per person, their earliest two completed checks RETEST_WINDOW_DAYS
 *   apart by UTC date. The same rule as the retest correlation of the team dashboard.
 * - response: every two consecutive completed checks of the same person, with the answers of
 *   both.
 * - version effect: the overall price of every check under the versions in force and under a
 *   second version. With `against` it is computed now, in memory, and nothing is stored (the
 *   command does this). Without it, checks that already hold a stored result under another
 *   version are used (the dashboard does this, so a request never re-scores history).
 *
 * People are never named: the output holds counts, shares and correlations only.
 */
import {
  CURRENT,
  RETEST_WINDOW_DAYS,
  EVALUATION,
  SEVEN_TESTS,
  fairnessTest,
  gamingTest,
  getBank,
  rangeTest,
  responseTest,
  stabilityTest,
  validityTest,
  versionEffectTest,
  type EvalAnswer,
  type EvalPair,
  type EvalRecord,
  type EvalVersionPair,
  type FairnessTest,
  type FlagId,
  type GamingTest,
  type Grade,
  type RangeTest,
  type ResponseTest,
  type StabilityTest,
  type ValidityTest,
  type VersionEffectTest,
} from '../../engine';
import type { SevenTestResults, TeamTestsResponse } from '../../shared/api';
import type { Db } from '../db';
import { csv, daysBetween, type CsvCell } from '../http';
import { recompute } from '../recompute';
import { shownResultCte } from './shared';

export type { SevenTestResults } from '../../shared/api';

export interface EvalData {
  /** Completed checks with a stored result. */
  checks: number;
  people: number;
  /** People flagged as simulated. Above 0 the numbers include demo data. */
  demoPeople: number;
  records: EvalRecord[];
  retestPairs: EvalPair[];
  consecutivePairs: EvalPair[];
  versionPairs: EvalVersionPair[];
  /** What the version effect compares, in words. null when there is nothing to compare. */
  versionComparison: string | null;
}

export interface EvalOptions {
  /** Compute the version effect against this algorithm (and norm) now, without storing. */
  against?: { algo: number; norm?: string };
  now: Date;
}

interface CheckRow {
  id: string;
  user_id: string;
  completed_at: string;
  role: string;
  age: number;
  is_demo: boolean;
  overall: number | null;
  price_c: number | null;
  price_w: number | null;
  price_n: number | null;
  price_b: number | null;
  price_m: number | null;
  grade: string;
  flags: unknown;
  social: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The label of an age band, so the fairness table reads "25 to 29" and not an index. */
function ageLabel(age: number): string {
  return getBank(CURRENT.bank).ages[age]?.en ?? String(age);
}

function recordOf(row: CheckRow): EvalRecord {
  const flags = Array.isArray(row.flags)
    ? row.flags.flatMap((f) => (isRecord(f) && typeof f.id === 'string' ? [f.id as FlagId] : []))
    : undefined;
  const social = isRecord(row.social) ? row.social : null;
  return {
    role: row.role,
    age: ageLabel(row.age),
    overall: row.overall,
    sectors: { C: row.price_c, W: row.price_w, N: row.price_n, B: row.price_b, M: row.price_m },
    grade: (['A', 'B', 'C'] as const).includes(row.grade as Grade) ? (row.grade as Grade) : undefined,
    flags,
    ladder: social ? numberOrNull(social.ladder) : null,
    objectivePrice: social ? numberOrNull(social.objectivePrice) : null,
  };
}

/** Loads everything the seven tests read. Reads only. */
export async function loadEvalData(db: Db, options: EvalOptions): Promise<EvalData> {
  const rows = await db.query<CheckRow>(
    `with ${shownResultCte('$1', '$2')}
     select s.id, s.user_id, s.completed_at, s.role, s.age, u.is_demo,
       r.overall, r.price_c, r.price_w, r.price_n, r.price_b, r.price_m, r.grade,
       r.result -> 'flags' as flags, r.result -> 'socialPosition' as social
     from sessions s join users u on u.id = s.user_id join res r on r.session_id = s.id
     where s.completed_at is not null
     order by s.user_id, s.completed_at, s.id`,
    [CURRENT.algo, CURRENT.norm],
  );

  // The checks of each person, oldest first.
  const byPerson = new Map<string, CheckRow[]>();
  for (const row of rows) {
    const list = byPerson.get(row.user_id) ?? [];
    list.push(row);
    byPerson.set(row.user_id, list);
  }

  // Answers are needed only for people with more than one check.
  const repeatIds = [...byPerson.values()].filter((list) => list.length > 1).flatMap((list) => list.map((c) => c.id));
  const answers = new Map<string, EvalAnswer[]>();
  if (repeatIds.length > 0) {
    const events = await db.query<{ session_id: string; item_id: string; version_key: string; option_index: number | null }>(
      `select session_id, item_id, version_key, option_index from question_events
       where action <> 'shown' and session_id in (select jsonb_array_elements_text($1::jsonb))
       order by session_id, seq`,
      [JSON.stringify(repeatIds)],
    );
    for (const e of events) {
      const list = answers.get(e.session_id) ?? [];
      list.push({ id: e.item_id, key: e.version_key, k: e.option_index });
      answers.set(e.session_id, list);
    }
  }

  const pairOf = (a: CheckRow, b: CheckRow): EvalPair => ({
    first: { overall: a.overall, steps: answers.get(a.id) ?? [] },
    second: { overall: b.overall, steps: answers.get(b.id) ?? [] },
    daysApart: daysBetween(a.completed_at.slice(0, 10), b.completed_at.slice(0, 10)),
  });
  const retestPairs: EvalPair[] = [];
  const consecutivePairs: EvalPair[] = [];
  for (const list of byPerson.values()) {
    for (let i = 1; i < list.length; i += 1) consecutivePairs.push(pairOf(list[i - 1], list[i]));
    // The earliest first check that has a second one in the window, and for it the earliest second.
    let found = false;
    for (let i = 0; i < list.length && !found; i += 1) {
      for (let j = i + 1; j < list.length && !found; j += 1) {
        const pair = pairOf(list[i], list[j]);
        const apart = pair.daysApart as number;
        if (apart >= RETEST_WINDOW_DAYS.min && apart <= RETEST_WINDOW_DAYS.max) {
          retestPairs.push(pair);
          found = true;
        }
      }
    }
  }

  let versionPairs: EvalVersionPair[] = [];
  let versionComparison: string | null = null;
  if (options.against) {
    const report = await recompute(db, { ...options.against, now: options.now, topMoves: Number.MAX_SAFE_INTEGER });
    versionPairs = report.largestMoves.map((m) => ({ before: m.oldOverall, after: m.newOverall }));
    versionComparison =
      `algorithm ${report.current.algo}, norm ${report.current.norm} (stored) against ` +
      `algorithm ${report.target.algo}, norm ${report.target.norm} (computed now, not stored)`;
  } else {
    // Stored results under another version, next to the one in force: the newest other row of each check.
    const stored = await db.query<{ before: number | null; after: number | null; algo_version: number; norm_version: string }>(
      `select cur.overall as before, other.overall as after, other.algo_version, other.norm_version
       from results cur
       join lateral (
         select o.overall, o.algo_version, o.norm_version from results o
         where o.session_id = cur.session_id and (o.algo_version <> $1 or o.norm_version <> $2)
         order by o.computed_at desc, o.algo_version desc limit 1
       ) other on true
       where cur.algo_version = $1 and cur.norm_version = $2`,
      [CURRENT.algo, CURRENT.norm],
    );
    versionPairs = stored.map((r) => ({ before: r.before, after: r.after }));
    if (stored.length > 0) {
      const others = [...new Set(stored.map((r) => `algorithm ${r.algo_version}, norm ${r.norm_version}`))].sort();
      versionComparison = `algorithm ${CURRENT.algo}, norm ${CURRENT.norm} against stored results under ${others.join('; ')}`;
    }
  }

  return {
    checks: rows.length,
    people: byPerson.size,
    demoPeople: new Set(rows.filter((r) => r.is_demo).map((r) => r.user_id)).size,
    records: rows.map(recordOf),
    retestPairs,
    consecutivePairs,
    versionPairs,
    versionComparison,
  };
}


/** Runs the seven tests of the engine over loaded data. Pure. */
export function runSevenTests(data: EvalData): SevenTestResults {
  return {
    range: rangeTest(data.records),
    stability: stabilityTest(data.retestPairs),
    response: responseTest(data.consecutivePairs),
    validity: validityTest(data.records),
    fairness: fairnessTest(data.records),
    gaming: gamingTest(data.records),
    versionEffect: versionEffectTest(data.versionPairs),
  };
}

// ---------------------------------------------------------------- the dashboard table

/** GET /api/team/tests: the seven tests over the stored checks. Reads only, computes no result. */
export async function teamTests(db: Db, now: Date): Promise<TeamTestsResponse> {
  const data = await loadEvalData(db, { now });
  return {
    generatedAt: now.toISOString(),
    demoPeople: data.demoPeople,
    versions: { ...CURRENT },
    checks: data.checks,
    people: data.people,
    retestPairs: data.retestPairs.length,
    consecutivePairs: data.consecutivePairs.length,
    versionPairs: data.versionPairs.length,
    versionComparison: data.versionComparison,
    thresholds: EVALUATION,
    results: runSevenTests(data),
  };
}

/** Every number of a test result as (metric, value) lines. Groups of a list are named by their `group`. */
function metricsOf(value: unknown, path: string, out: Array<[string, CsvCell]>): void {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const name = typeof item === 'object' && item !== null && typeof item.group === 'string' ? item.group : String(index);
      metricsOf(item, `${path}.${name}`, out);
    });
  } else if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (key !== 'group') metricsOf(inner, path === '' ? key : `${path}.${key}`, out);
    }
  }
}

/** One line per number: test, verdict, reasons, n, metric, value. */
export function teamTestsCsv(data: TeamTestsResponse): Response {
  const rows: CsvCell[][] = [];
  for (const test of SEVEN_TESTS) {
    const { verdict, reasons, n, ...numbers } = data.results[test];
    const metrics: Array<[string, CsvCell]> = [];
    metricsOf(numbers, '', metrics);
    for (const [metric, value] of metrics) rows.push([test, verdict, reasons.join(' '), n, metric, value]);
  }
  return csv('standing-seven-tests', ['test', 'verdict', 'reasons', 'n', 'metric', 'value'], rows);
}
