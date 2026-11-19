// Completing a check: the server rebuilds the steps from the stored events, runs the engine and
// stores the derived result with its three versions. Also resuming, and the home page read.

import { describe, expect, it } from 'vitest';
import { compute, CURRENT, nextQuestion, ROLE_IDS, type NextQuestion, type Result, type Step } from '@/engine';
import { answer, answerEvent, backgroundFor, bank, makeApi, newSession, newUser, shownEvent } from './helpers/api';

const emp = backgroundFor('emp');

/** What a result looks like after a trip through JSON, which is how the server stores and returns it. */
function viaJson(result: Result): unknown {
  return JSON.parse(JSON.stringify(result));
}

describe('complete', () => {
  it('computes exactly what the engine computes on the same steps, for every role', async () => {
    const api = await makeApi();
    for (const role of ROLE_IDS) {
      const user = await newUser(api);
      const background = backgroundFor(role);
      const session = await newSession(api, user.deviceToken, { role });
      // A mix of answers, fast and slow times, both languages, and a few skips.
      const steps: Step[] = [];
      for (let part = 0; ; part++) {
        const before = steps.length;
        const more = await answer(
          api,
          user.deviceToken,
          session.id,
          background,
          (q, i) => (i % 7 === 6 ? null : (i * 3 + role.length) % q.version.opts.length),
          { limit: 5, startSteps: steps, seconds: part % 2 === 0 ? 0.4 : 6.5, lang: part % 3 === 0 ? 'zh' : 'en' },
        );
        steps.splice(0, steps.length, ...more);
        if (steps.length === before) break;
      }
      expect(nextQuestion(bank, background, steps)).toBeNull();

      const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
      expect(done.status).toBe(200);
      const expected = compute({ bank, background, steps, excludedAreas: [], previous: null });
      expect(done.body.stored.result, role).toEqual(viaJson(expected));
      expect(done.body.stored.versions).toEqual(CURRENT);
      expect(done.body.change).toBeNull();
      // The steps the server rebuilt are the steps the client held.
      const stored = await api.call('GET', `/api/sessions/${session.id}`, { token: user.deviceToken });
      expect(stored.body.steps).toEqual(steps);
    }
  });

  it('stores the result with the algorithm, bank and norm version, and the sector columns', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    const steps = await answer(api, user.deviceToken, session.id, emp, () => 3);
    api.setNow('2026-03-01T12:06:00.000Z');
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    const expected = compute({ bank, background: emp, steps });

    const rows = await api.db.query<Record<string, unknown>>('select * from results');
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      session_id: session.id,
      user_id: user.userId,
      algo_version: 1,
      bank_version: '2.1',
      norm_version: 'provisional-1',
      computed_at: '2026-03-01T12:06:00.000Z',
      overall: expected.overall,
      price_c: expected.sectors.C.price,
      price_w: expected.sectors.W.price,
      price_n: expected.sectors.N.price,
      price_b: expected.sectors.B.price,
      price_m: expected.sectors.M.price,
      raw_c: expected.sectors.C.raw,
      raw_m: expected.sectors.M.raw,
      grade: expected.grade,
    });
    expect(rows[0].result).toEqual(viaJson(expected));
    expect(done.body.stored).toMatchObject({
      sessionId: session.id,
      completedAt: '2026-03-01T12:06:00.000Z',
      computedAt: '2026-03-01T12:06:00.000Z',
    });
    const sessions = await api.db.query('select completed_at from sessions');
    expect(sessions).toEqual([{ completed_at: '2026-03-01T12:06:00.000Z' }]);
  });

  it('refuses while questions are left, and says how far the check is', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    await answer(api, user.deviceToken, session.id, emp, () => 2, { limit: 12 });
    const res = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('session_incomplete');
    expect(res.body.error.details).toEqual({ answered: 12, total: 34, next: { itemId: 'W3', versionKey: 'base' } });
    expect((await api.db.query('select 1 from results')).length).toBe(0);
  });

  it('is repeatable: a second call returns the stored result and writes nothing', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    await answer(api, user.deviceToken, session.id, emp, () => 1);
    const first = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    api.setNow('2026-03-05T00:00:00.000Z');
    const second = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect((await api.db.query('select 1 from results')).length).toBe(1);
  });

  it('a check made only of skips completes without an overall price', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    const steps = await answer(api, user.deviceToken, session.id, emp, () => null);
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(done.status).toBe(200);
    expect(done.body.stored.result).toEqual(viaJson(compute({ bank, background: emp, steps })));
    expect(done.body.stored.result.overall).toBeNull();
    expect(done.body.stored.result.counts.skipped).toBe(steps.length);
  });
});

describe('resume', () => {
  it('returns the stored steps and the question the person left on', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    const steps = await answer(api, user.deviceToken, session.id, emp, (q, i) => (i === 3 ? null : 1), { limit: 8 });
    const pendingQuestion = nextQuestion(bank, emp, steps) as NextQuestion;
    await api.call('POST', `/api/sessions/${session.id}/events`, {
      token: user.deviceToken,
      body: { events: [shownEvent(pendingQuestion, 8, { rng: 0.1 })] },
    });

    const open = await api.call('GET', '/api/sessions/open', { token: user.deviceToken });
    expect(open.status).toBe(200);
    expect(open.body.open.session.id).toBe(session.id);
    expect(open.body.open.steps).toEqual(steps);
    expect(open.body.open.steps[3].k).toBeNull();
    expect(open.body.open.pending).toEqual({
      seq: 8,
      itemId: pendingQuestion.id,
      versionKey: pendingQuestion.key,
      displayDirection: 'best_first',
    });
    // The engine, fed the stored steps, gives the same next question the person left on.
    expect(nextQuestion(bank, emp, open.body.open.steps)?.id).toBe(pendingQuestion.id);

    const byId = await api.call('GET', `/api/sessions/${session.id}`, { token: user.deviceToken });
    expect(byId.body).toEqual(open.body.open);

    // Finishing from the stored steps gives a normal result.
    const all = await answer(api, user.deviceToken, session.id, emp, () => 2, { startSteps: open.body.open.steps });
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(done.body.stored.result).toEqual(viaJson(compute({ bank, background: emp, steps: all })));
    expect((await api.call('GET', '/api/sessions/open', { token: user.deviceToken })).body).toEqual({ open: null });
  });
});

describe('GET /api/me', () => {
  it('returns the latest result, the change, the history for the chart, and the all-time high and low', async () => {
    const api = await makeApi({ now: '2026-01-05T10:00:00.000Z' });
    const user = await newUser(api);
    const token = user.deviceToken;

    // Three checks: middling, high, low.
    const choices = [() => 2, (q: NextQuestion) => q.version.opts.length - 2, () => 1];
    const days = ['2026-01-05T10:00:00.000Z', '2026-02-05T10:00:00.000Z', '2026-03-05T10:00:00.000Z'];
    const results: Result[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      api.setNow(days[i]);
      const session = await newSession(api, token, { body: { ticker: 'OSCR' } });
      const steps = await answer(api, token, session.id, emp, choices[i]);
      const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token });
      const previous = i === 0 ? null : Object.fromEntries(
        (['C', 'W', 'N', 'B', 'M'] as const).map((a) => [a, results[i - 1].sectors[a].price]),
      );
      const expected = compute({ bank, background: emp, steps, previous });
      // From the second check on, the engine is given the previous prices, so the result names movers.
      expect(done.body.stored.result).toEqual(viaJson(expected));
      results.push(expected);
      ids.push(session.id);
    }
    const overall = results.map((r) => r.overall as number);
    expect(new Set(overall).size).toBe(3);
    expect(results[1].market.change).not.toBeNull();

    const me = await api.call('GET', '/api/me', { token });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: user.userId, ticker: 'OSCR', role: 'emp', age: 2 });
    expect(me.body.latest.sessionId).toBe(ids[2]);
    expect(me.body.latest.result).toEqual(viaJson(results[2]));
    expect(me.body.latest.versions).toEqual(CURRENT);
    expect(me.body.change).toEqual({
      previousSessionId: ids[1],
      previousAt: days[1],
      previousOverall: overall[1],
      delta: overall[2] - overall[1],
      percent: ((overall[2] - overall[1]) / overall[1]) * 100,
    });
    expect(me.body.history).toEqual(
      results.map((r, i) => ({
        sessionId: ids[i],
        at: days[i],
        overall: r.overall,
        sectors: { C: r.sectors.C.price, W: r.sectors.W.price, N: r.sectors.N.price, B: r.sectors.B.price, M: r.sectors.M.price },
        grade: r.grade,
        versions: CURRENT,
      })),
    );
    expect(me.body.allTime).toEqual({ high: Math.max(...overall), low: Math.min(...overall) });
    expect(me.body.allTime.high).toBe(overall[1]);
    expect(me.body.allTime.low).toBe(overall[2]);
    expect(me.body.openSession).toBeNull();
  });

  it('shows the result computed with the current versions when a check has several', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    await answer(api, user.deviceToken, session.id, emp, () => 2);
    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    // A recomputation under another algorithm version sits next to the first result.
    await api.db.query(
      `insert into results (session_id, algo_version, norm_version, bank_version, user_id, computed_at, overall, grade, result)
       select session_id, 99, norm_version, bank_version, user_id, '2099-01-01T00:00:00.000Z', 55, 'C', result from results`,
    );
    const me = await api.call('GET', '/api/me', { token: user.deviceToken });
    expect(me.body.history.length).toBe(1);
    expect(me.body.history[0].versions.algo).toBe(1);
    expect(me.body.latest.result.overall).toBe(done.body.stored.result.overall);
    expect((await api.db.query('select 1 from results')).length).toBe(2);
  });
});
