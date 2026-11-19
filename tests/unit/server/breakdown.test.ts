// "Why it moved" (PROMPT.md section 8): for a change between two checks, the points each
// changed answer added. The lines of every price add up to its change.

import { describe, expect, it } from 'vitest';
import { AREA_IDS, type Breakdown, type NextQuestion } from '@/engine';
import { answer, backgroundFor, makeApi, newSession, newUser, type TestApi } from './helpers/api';

const emp = backgroundFor('emp');

async function check(api: TestApi, token: string, choose: (q: NextQuestion, index: number) => number | null): Promise<any> {
  const session = await newSession(api, token);
  await answer(api, token, session.id, emp, choose);
  const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token });
  if (done.status !== 200) throw new Error(done.text);
  api.advance(14 * 86_400_000);
  return { id: session.id, result: done.body.stored.result };
}

const sum = (lines: Array<{ points: number }>) => lines.reduce((total, line) => total + line.points, 0);

describe('GET /api/me/breakdown', () => {
  it('has nothing to break down before the second check', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const none = await api.call('GET', '/api/me/breakdown', { token: user.deviceToken });
    expect(none.body).toEqual({ from: null, to: null, breakdown: null });
    const first = await check(api, user.deviceToken, () => 1);
    const one = await api.call('GET', '/api/me/breakdown', { token: user.deviceToken });
    expect(one.body.breakdown).toBeNull();
    expect(one.body.from).toBeNull();
    expect(one.body.to).toMatchObject({ sessionId: first.id, overall: first.result.overall });
    expect((await api.call('GET', '/api/me/breakdown', {})).status).toBe(401);
  });

  it('the latest change: the lines of every sector and of the overall price add up to the move', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const token = user.deviceToken;
    const first = await check(api, token, () => 1);
    // Three questions answered differently the second time, one of them skipped.
    const second = await check(api, token, (_q, index) => (index === 4 ? 3 : index === 9 ? 0 : index === 20 ? null : 1));

    const res = await api.call('GET', '/api/me/breakdown', { token });
    expect(res.status).toBe(200);
    expect(res.body.from).toEqual({
      sessionId: first.id,
      at: res.body.from.at,
      versions: { algo: 1, bank: '2.1', norm: 'provisional-1' },
      overall: first.result.overall,
    });
    expect(res.body.to).toMatchObject({ sessionId: second.id, overall: second.result.overall });

    const b = res.body.breakdown as Breakdown;
    expect(b.changed).toBe(3);
    // The prices in the breakdown are the prices the user was shown.
    expect(b.overall.before).toBe(first.result.overall);
    expect(b.overall.after).toBe(second.result.overall);
    expect(b.overall.delta).toBeCloseTo(second.result.overall - first.result.overall, 9);
    expect(sum(b.overall.lines)).toBeCloseTo(b.overall.delta as number, 9);
    let moved = 0;
    for (const area of AREA_IDS) {
      const sector = b.sectors[area];
      expect(sector.before).toBe(first.result.sectors[area].price);
      expect(sector.after).toBe(second.result.sectors[area].price);
      expect(sum(sector.lines), area).toBeCloseTo(sector.delta as number, 9);
      if (sector.delta !== 0) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    // Every line names one of the changed questions and says what the answer was and is.
    const changedIds = second.result.steps.filter((_s: unknown, i: number) => [4, 9, 20].includes(i)).map((s: any) => s.id);
    for (const line of b.overall.lines) {
      expect(line.kind).toBe('answer');
      expect(changedIds).toContain(line.id);
      expect(line.before?.k).toBe(1);
    }
    // The same call through the history: the change shown on the home page is the one explained.
    const me = await api.call('GET', '/api/me', { token });
    expect(me.body.change.delta).toBeCloseTo(b.overall.delta as number, 9);
  });

  it('between two chosen checks, in either direction, and for an earlier change', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const token = user.deviceToken;
    const a = await check(api, token, () => 1);
    const b = await check(api, token, (_q, i) => (i < 6 ? 2 : 1));
    const c = await check(api, token, (_q, i) => (i < 12 ? 2 : 1));

    const latest = (await api.call('GET', '/api/me/breakdown', { token })).body;
    expect([latest.from.sessionId, latest.to.sessionId]).toEqual([b.id, c.id]);

    const earlier = (await api.call('GET', `/api/me/breakdown?to=${b.id}`, { token })).body;
    expect([earlier.from.sessionId, earlier.to.sessionId]).toEqual([a.id, b.id]);
    expect(earlier.breakdown.changed).toBe(6);

    const whole = (await api.call('GET', `/api/me/breakdown?from=${a.id}&to=${c.id}`, { token })).body;
    // Twelve answers differ. An answer that sets the route also changes the wording of later
    // questions, and a question asked in another wording counts as changed too.
    expect(whole.breakdown.changed).toBeGreaterThanOrEqual(12);
    expect(whole.breakdown.overall.delta).toBeCloseTo(c.result.overall - a.result.overall, 9);
    expect(sum(whole.breakdown.overall.lines)).toBeCloseTo(whole.breakdown.overall.delta, 9);

    const back = (await api.call('GET', `/api/me/breakdown?from=${c.id}&to=${a.id}`, { token })).body;
    expect(back.breakdown.overall.delta).toBeCloseTo(-whole.breakdown.overall.delta, 9);

    // The first check has nothing before it; a check against itself has nothing to explain.
    expect((await api.call('GET', `/api/me/breakdown?to=${a.id}`, { token })).body.breakdown).toBeNull();
    expect((await api.call('GET', `/api/me/breakdown?from=${b.id}&to=${b.id}`, { token })).body.breakdown).toBeNull();
  });

  it('only takes completed checks of the caller', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const other = await newUser(api);
    const mine = await check(api, user.deviceToken, () => 1);
    await check(api, user.deviceToken, () => 2);
    const theirs = await check(api, other.deviceToken, () => 1);
    const open = await newSession(api, user.deviceToken);
    for (const query of [`to=${theirs.id}`, `from=${theirs.id}&to=${mine.id}`, `to=${open.id}`, 'to=no-such-check']) {
      const res = await api.call('GET', `/api/me/breakdown?${query}`, { token: user.deviceToken });
      expect([res.status, res.body.error.code], query).toEqual([404, 'not_found']);
    }
    // Reading a breakdown stores nothing.
    expect((await api.db.query('select 1 from results')).length).toBe(3);
  });
});
