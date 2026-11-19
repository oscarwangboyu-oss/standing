// Versions and re-score (PROMPT.md section 8): every result row records its three versions,
// history can be scored again under another algorithm, the old and the new result both stay,
// and the day of a version change is logged for the chart.

import { beforeAll, describe, expect, it } from 'vitest';
import { ALGO_PARAMS, ALGOS, CURRENT, RECOMPUTE_MOVE_POINTS, createAlgoV1, registerAlgo, type NextQuestion } from '@/engine';
import type { Db } from '@/server/db';
import { formatRecomputeReport, rankCorrelation, ranksOf, recompute } from '@/server/recompute';
import { logVersion, versionMarkers } from '@/server/versions';
import { answer, backgroundFor, makeApi, newSession, newUser, type TestApi } from './helpers/api';

const emp = backgroundFor('emp');
const NOW = new Date('2026-04-01T09:00:00.000Z');

// A deliberately altered algorithm, for tests only: fast answers keep their full weight. Under
// version 1 an answer faster than its threshold counts at half weight at least, which pulls the
// price toward 100, so this version moves everyone who answered fast.
const TRIAL = 902;
beforeAll(() => {
  if (!Object.hasOwn(ALGOS, TRIAL)) {
    const params = structuredClone(ALGO_PARAMS[CURRENT.algo]);
    params.timing.multiplierFloor = 1;
    registerAlgo(createAlgoV1(TRIAL, params));
  }
});

/** The option of a question whose score is nearest to a level from 0 (lowest) to 1 (highest). */
function nearest(q: NextQuestion, level: number): number {
  let best = 0;
  let distance = Infinity;
  q.version.s.forEach((score, index) => {
    if (score !== null && Math.abs(score - level) < distance) {
      distance = Math.abs(score - level);
      best = index;
    }
  });
  return best;
}

/**
 * A person with completed checks who always picks the option nearest to `level`.
 * `fast`: every answer in 0.1 seconds, so the time discount applies.
 */
async function person(api: TestApi, level: number, fast: boolean, checks = 1): Promise<{ userId: string; token: string; sessions: string[] }> {
  const user = await newUser(api);
  const sessions: string[] = [];
  for (let i = 0; i < checks; i += 1) {
    const session = await newSession(api, user.deviceToken);
    await answer(api, user.deviceToken, session.id, emp, (q) => nearest(q, level), { seconds: fast ? 0.1 : 6 });
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    if (done.status !== 200) throw new Error(done.text);
    sessions.push(session.id);
    api.advance(14 * 86_400_000);
  }
  return { userId: user.userId, token: user.deviceToken, sessions };
}

const resultRows = (db: Db) =>
  db.query<{ session_id: string; algo_version: number; norm_version: string; overall: number; computed_at: string }>(
    'select session_id, algo_version, norm_version, overall, computed_at from results order by session_id, algo_version',
  );

describe('rank correlation', () => {
  it('ranks ties at the mean of their ranks', () => {
    expect(ranksOf([10, 30, 20, 30])).toEqual([1, 3.5, 2, 3.5]);
  });

  it('is 1 for the same order, -1 for the reverse, null without spread or with one pair', () => {
    expect(rankCorrelation([1, 2, 3, 4], [10, 20, 30, 400])).toBeCloseTo(1, 12);
    expect(rankCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    // Ranks [1,2,3,4,5] against [2,1,4,3,5]: sum of squared differences 4, so 1 - 6*4/(5*24) = 0.8.
    expect(rankCorrelation([1, 2, 3, 4, 5], [20, 10, 40, 30, 50])).toBeCloseTo(0.8, 12);
    expect(rankCorrelation([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(rankCorrelation([1], [2])).toBeNull();
  });
});

describe('recompute', () => {
  it('scoring again with the versions in force reproduces every stored result', async () => {
    const api = await makeApi();
    await person(api, 0.75, false, 2);
    await person(api, 0.25, true);
    const before = await resultRows(api.db);
    const report = await recompute(api.db, { algo: CURRENT.algo, now: NOW });
    expect(report).toMatchObject({
      sessions: 3,
      people: 2,
      demoPeople: 0,
      rescored: 3,
      failed: [],
      compared: 3,
      withoutOld: 0,
      rankCorrelation: 1,
      meanAbsoluteMove: 0,
      wrote: false,
      written: 0,
      logged: [],
    });
    expect(report.moved.sessions).toEqual({ count: 0, of: 3, rate: 0 });
    expect(report.moved.people).toEqual({ count: 0, of: 2, rate: 0 });
    // Nothing was written.
    expect(await resultRows(api.db)).toEqual(before);
    expect(await api.db.query('select * from version_log')).toEqual([]);
  });

  it('an altered algorithm gives old against new: who moved, by how much, and the largest moves', async () => {
    const api = await makeApi();
    const slowHigh = await person(api, 1, false);
    const fastHigh = await person(api, 1, true);
    const fastLow = await person(api, 0, true);
    const slowMid = await person(api, 0.5, false);
    const before = await resultRows(api.db);
    const old = new Map(before.map((r) => [r.session_id, r.overall]));

    const report = await recompute(api.db, { algo: TRIAL, now: NOW });
    expect(report.target).toEqual({ algo: TRIAL, norm: CURRENT.norm });
    expect(report.current).toEqual({ algo: CURRENT.algo, norm: CURRENT.norm });
    expect([report.sessions, report.people, report.rescored, report.compared]).toEqual([4, 4, 4, 4]);

    // People who answered at a normal pace do not move at all. The fast ones lose the pull
    // toward 100: the high one rises to where the slow high one is, the low one falls.
    const moveOf = (id: string) => report.largestMoves.find((m) => m.sessionId === id)!;
    expect(moveOf(slowHigh.sessions[0]).delta).toBe(0);
    expect(moveOf(slowMid.sessions[0]).delta).toBe(0);
    expect(moveOf(fastHigh.sessions[0]).delta).toBeGreaterThan(RECOMPUTE_MOVE_POINTS);
    expect(moveOf(fastLow.sessions[0]).delta).toBeLessThan(-RECOMPUTE_MOVE_POINTS);
    expect(moveOf(fastHigh.sessions[0]).newOverall).toBeCloseTo(old.get(slowHigh.sessions[0])!, 9);
    for (const move of report.largestMoves) {
      expect(move.oldOverall).toBe(old.get(move.sessionId));
      expect(move.delta).toBeCloseTo(move.newOverall - move.oldOverall, 12);
    }
    // Largest first.
    const sizes = report.largestMoves.map((m) => Math.abs(m.delta));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

    expect(report.moved).toEqual({
      points: RECOMPUTE_MOVE_POINTS,
      sessions: { count: 2, of: 4, rate: 0.5 },
      people: { count: 2, of: 4, rate: 0.5 },
    });
    expect(report.meanAbsoluteMove).toBeCloseTo(sizes.reduce((a, b) => a + b, 0) / 4, 12);
    expect(report.rankCorrelation).toBeCloseTo(
      rankCorrelation(report.largestMoves.map((m) => m.oldOverall), report.largestMoves.map((m) => m.newOverall))!,
      12,
    );
    expect(report.rankCorrelation).toBeGreaterThan(0.5);

    // Compare only: nothing stored, nothing logged.
    expect(await resultRows(api.db)).toEqual(before);
    expect(await api.db.query('select * from version_log')).toEqual([]);

    const text = formatRecomputeReport(report);
    expect(text).toContain(`algorithm ${TRIAL}`);
    expect(text).toContain('Completed checks: 4 from 4 people');
    expect(text).toContain(`People moving more than ${RECOMPUTE_MOVE_POINTS} points (latest check): 2 of 4 (50.0%)`);
    expect(text).toContain('Nothing was stored.');
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it('--write stores the new rows next to the old ones, never overwrites, and logs the change once', async () => {
    const api = await makeApi();
    const a = await person(api, 1, true, 2);
    await person(api, 0.25, false);
    const before = await resultRows(api.db);

    const first = await recompute(api.db, { algo: TRIAL, write: true, now: NOW });
    expect([first.wrote, first.written, first.alreadyStored]).toEqual([true, 3, 0]);
    expect(first.logged).toEqual([{ kind: 'algo', version: String(TRIAL), day: '2026-04-01' }]);

    const after = await resultRows(api.db);
    expect(after.length).toBe(6);
    // The old rows are exactly as they were.
    expect(after.filter((r) => r.algo_version === CURRENT.algo)).toEqual(before);
    const fresh = after.filter((r) => r.algo_version === TRIAL);
    expect(fresh.map((r) => r.computed_at)).toEqual(Array(3).fill('2026-04-01T09:00:00.000Z'));
    for (const row of fresh) {
      const move = first.largestMoves.find((m) => m.sessionId === row.session_id)!;
      expect(row.overall).toBe(move.newOverall);
    }
    // The full result of the new row carries its versions, and its movers refer to the new prices.
    const stored = await api.db.query<{ result: any }>(
      'select result from results where session_id = $1 and algo_version = $2',
      [a.sessions[1], TRIAL],
    );
    expect(stored[0].result.versions).toEqual({ algo: TRIAL, bank: CURRENT.bank, norm: CURRENT.norm });

    // A second run finds its rows in place and changes nothing. The first day logged is kept.
    const again = await recompute(api.db, { algo: TRIAL, write: true, now: new Date('2026-05-05T09:00:00.000Z') });
    expect([again.written, again.alreadyStored, again.logged]).toEqual([0, 3, []]);
    expect(await resultRows(api.db)).toEqual(after);
    expect(await api.db.query('select kind, version, effective_day, logged_at from version_log')).toEqual([
      { kind: 'algo', version: String(TRIAL), effective_day: '2026-04-01', logged_at: '2026-04-01T09:00:00.000Z' },
    ]);
    expect(formatRecomputeReport(first)).toContain(`Version log: algo ${TRIAL} from 2026-04-01`);
    expect(formatRecomputeReport(again)).toContain('Stored: 0 new result rows. Already stored and left as they were: 3');

    // The app still shows the results of the versions in force.
    const me = await api.call('GET', '/api/me', { token: a.token });
    expect(me.body.history.map((h: any) => h.versions.algo)).toEqual([CURRENT.algo, CURRENT.algo]);
    expect(me.body.latest.versions.algo).toBe(CURRENT.algo);
  });

  it('takes the chosen effective day, refuses unknown versions, and reads an empty database', async () => {
    const api = await makeApi();
    const empty = await recompute(api.db, { algo: TRIAL, now: NOW });
    expect(empty).toMatchObject({ sessions: 0, people: 0, compared: 0, rankCorrelation: null, meanAbsoluteMove: null });
    expect(empty.moved.people).toEqual({ count: 0, of: 0, rate: null });
    expect(formatRecomputeReport(empty)).toContain('Rank correlation of the overall price (Spearman): n/a');

    await person(api, 0.5, true);
    await expect(recompute(api.db, { algo: 4242, now: NOW })).rejects.toThrow(/unknown algorithm version 4242/);
    await expect(recompute(api.db, { algo: TRIAL, norm: 'no-such-norm', now: NOW })).rejects.toThrow(/unknown norm version/);
    const report = await recompute(api.db, { algo: TRIAL, write: true, now: NOW, effectiveDay: '2026-04-10' });
    expect(report.logged).toEqual([{ kind: 'algo', version: String(TRIAL), day: '2026-04-10' }]);
  });

  it('says so when the data is simulated', async () => {
    const api = await makeApi();
    const p = await person(api, 0.5, true);
    await api.db.query('update users set is_demo = true where id = $1', [p.userId]);
    const report = await recompute(api.db, { algo: TRIAL, now: NOW });
    expect(report.demoPeople).toBe(1);
    expect(formatRecomputeReport(report)).toContain('SIMULATED DATA: 1 of 1 people are demo rows.');
  });
});

describe('version markers', () => {
  it('/api/me returns the logged changes of registered versions, oldest first, up to today', async () => {
    const api = await makeApi({ now: '2026-04-20T12:00:00.000Z' });
    const user = await newUser(api);
    const me = () => api.call('GET', '/api/me', { token: user.deviceToken });
    expect((await me()).body.versionMarkers).toEqual([]);

    expect(await logVersion(api.db, 'algo', String(TRIAL), '2026-04-10', '2026-04-10T08:00:00.000Z')).toBe(true);
    // The first day logged for a version is kept.
    expect(await logVersion(api.db, 'algo', String(TRIAL), '2026-04-15', '2026-04-15T08:00:00.000Z')).toBe(false);
    await logVersion(api.db, 'norm', CURRENT.norm, '2026-04-02', '2026-04-02T08:00:00.000Z');
    await logVersion(api.db, 'bank', CURRENT.bank, '2026-04-30', '2026-04-30T08:00:00.000Z');
    // A version this build does not know draws no line.
    await logVersion(api.db, 'algo', '777', '2026-04-05', '2026-04-05T08:00:00.000Z');
    await logVersion(api.db, 'norm', 'tried-once', '2026-04-05', '2026-04-05T08:00:00.000Z');

    const expected = [
      { kind: 'norm', version: CURRENT.norm, day: '2026-04-02' },
      { kind: 'algo', version: String(TRIAL), day: '2026-04-10' },
    ];
    expect((await me()).body.versionMarkers).toEqual(expected);
    expect(await versionMarkers(api.db, '2026-04-20')).toEqual(expected);
    // The bank change of 2026-04-30 appears once that day has come.
    api.setNow('2026-04-30T00:30:00.000Z');
    expect((await me()).body.versionMarkers.at(-1)).toEqual({ kind: 'bank', version: CURRENT.bank, day: '2026-04-30' });
    await expect(api.db.query("insert into version_log values ('font', '1', '2026-01-01', 'x')")).rejects.toThrow();
  });
});
