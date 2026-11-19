// The eval command: loading what the seven scoring tests read, and calling them.

import { beforeAll, describe, expect, it } from 'vitest';
import { ALGO_PARAMS, ALGOS, CURRENT, RETEST_WINDOW_DAYS, SEVEN_TESTS, createAlgoV1, registerAlgo } from '@/engine';
import type { Db } from '@/server/db';
import { recompute } from '@/server/recompute';
import { formatSevenTests, loadEvalData, runSevenTests, type EvalData } from '../../../scripts/lib/eval';
import { seedDemo, type SeedSummary } from '../../../scripts/lib/seed';
import { bank } from '../server/helpers/api';
import { freshDb } from '../server/helpers/db';

const NOW = new Date('2026-06-15T10:00:00.000Z');
const TRIAL = 941;

describe('the seven tests over a database', () => {
  let db: Db;
  let seeded: SeedSummary;
  let data: EvalData;

  beforeAll(async () => {
    if (!Object.hasOwn(ALGOS, TRIAL)) {
      const params = structuredClone(ALGO_PARAMS[CURRENT.algo]);
      params.timing.multiplierFloor = 1;
      registerAlgo(createAlgoV1(TRIAL, params));
    }
    db = await freshDb();
    seeded = await seedDemo(db, { seed: 3, people: 132, now: NOW });
    data = await loadEvalData(db, { now: NOW });
  }, 120_000);

  it('loads one record per completed check, with what each test reads', async () => {
    expect(data.checks).toBe(seeded.checksCompleted);
    expect(data.records.length).toBe(seeded.checksCompleted);
    expect(data.demoPeople).toBe(data.people);
    const stored = await db.query<{ overall: number | null; grade: string; role: string; age: number }>(
      `select r.overall, r.grade, s.role, s.age from results r join sessions s on s.id = r.session_id
       order by s.user_id, s.completed_at, s.id`,
    );
    expect(data.records.map((r) => [r.overall, r.grade, r.role, r.age])).toEqual(
      stored.map((r) => [r.overall, r.grade, r.role, bank.ages[r.age].en]),
    );
    expect(data.records.some((r) => typeof r.ladder === 'number' && typeof r.objectivePrice === 'number')).toBe(true);
    expect(data.records.every((r) => Array.isArray(r.flags))).toBe(true);
    // A person without the health consent has no body or mind price.
    expect(data.records.some((r) => r.sectors.B === null && r.sectors.M === null && r.sectors.C !== null)).toBe(true);
  });

  it('pairs the two checks of a person: the retest window for stability, with answers for response', () => {
    expect(data.retestPairs.length).toBe(seeded.secondChecks);
    expect(data.consecutivePairs.length).toBe(seeded.secondChecks);
    for (const pair of data.retestPairs) {
      expect(pair.daysApart).toBeGreaterThanOrEqual(RETEST_WINDOW_DAYS.min);
      expect(pair.daysApart).toBeLessThanOrEqual(RETEST_WINDOW_DAYS.max);
      expect(pair.first.steps!.length).toBeGreaterThan(10);
      expect(pair.second.steps!.length).toBeGreaterThan(10);
      expect(Object.keys(pair.first.steps![0]).sort()).toEqual(['id', 'k', 'key']);
    }
  });

  it('runs all seven and prints a verdict, a count and the numbers for each', () => {
    const results = runSevenTests(data);
    expect(Object.keys(results)).toEqual([...SEVEN_TESTS]);
    for (const name of SEVEN_TESTS) expect(['pass', 'warn', 'insufficient_data']).toContain(results[name].verdict);
    expect(results.range.n).toBe(data.records.filter((r) => r.overall !== null).length);
    expect(results.stability.n).toBe(seeded.secondChecks);
    expect(results.stability.correlation).toBeGreaterThan(0.5);
    expect(results.gaming.n).toBe(seeded.checksCompleted);
    expect(results.fairness.byRole.length).toBe(11);
    // Nothing stored under a second version yet.
    expect(data.versionComparison).toBeNull();
    expect(results.versionEffect).toMatchObject({ verdict: 'insufficient_data', n: 0 });

    const text = formatSevenTests(data, results);
    expect(text).toContain(`SIMULATED DATA: ${data.people} of ${data.people} people are demo rows.`);
    for (const title of ['1. Range', '2. Stability', '3. Response', '4. Validity', '5. Fairness', '6. Gaming', '7. Version effect']) {
      expect(text).toContain(title);
    }
    expect(text).toContain('Run again with --algo N');
    expect(text).not.toContain('demo-3-');
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it('version effect: against an algorithm computed now, or against stored results; neither names a person', async () => {
    const before = await db.query('select count(*)::int as n from results');
    const live = await loadEvalData(db, { now: NOW, against: { algo: TRIAL } });
    expect(await db.query('select count(*)::int as n from results')).toEqual(before);
    expect(live.versionPairs.length).toBe(live.records.filter((r) => r.overall !== null).length);
    expect(live.versionComparison).toContain(`algorithm ${TRIAL}`);
    expect(live.versionComparison).toContain('not stored');
    const liveTest = runSevenTests(live).versionEffect;
    expect(liveTest.n).toBe(live.versionPairs.length);
    expect(liveTest.largestMove).toBeGreaterThan(0);

    // After the results were stored, the same comparison is read from the table.
    await recompute(db, { algo: TRIAL, write: true, now: NOW });
    const stored = await loadEvalData(db, { now: NOW });
    expect(stored.versionComparison).toBe(
      `algorithm ${CURRENT.algo}, norm ${CURRENT.norm} against stored results under algorithm ${TRIAL}, norm ${CURRENT.norm}`,
    );
    const storedTest = runSevenTests(stored).versionEffect;
    expect(storedTest.n).toBe(liveTest.n);
    expect(storedTest.rankCorrelation).toBeCloseTo(liveTest.rankCorrelation as number, 12);
    expect(storedTest.largestMove).toBeCloseTo(liveTest.largestMove as number, 9);
    // The records of the other six tests still come from the versions in force.
    expect(stored.records).toEqual(data.records);
  });

  it('an empty database gives seven results without data and no error', async () => {
    const empty = await loadEvalData(await freshDb(), { now: NOW });
    expect(empty).toMatchObject({ checks: 0, people: 0, demoPeople: 0, records: [], retestPairs: [], versionPairs: [] });
    const results = runSevenTests(empty);
    for (const name of SEVEN_TESTS) expect(results[name].verdict).toBe('insufficient_data');
    expect(formatSevenTests(empty, results)).toContain('Completed checks: 0 from 0 people');
  });
});
