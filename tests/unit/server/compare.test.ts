// Friend compare (docs/roadmap.txt, stage 1): an invite link, and once both have a completed
// check the two results side by side. Each side shows what the share card shows and nothing
// else. Either person can delete the comparison. No ranking, no list of other people.

import { describe, expect, it } from 'vitest';
import { COMPARE_INVITE_DAYS, MAX_OPEN_INVITES } from '@/server/config';
import { sha256Hex } from '@/server/crypto';
import { answer, backgroundFor, countRows, makeApi, newSession, newUser, type TestApi } from './helpers/api';

const emp = backgroundFor('emp');
const DAY_MS = 86_400_000;

interface Person {
  userId: string;
  token: string;
  sessionId: string;
  result: any;
}

/** A person with one completed check. Every answer is option `k`. */
async function personWithCheck(api: TestApi, ticker: string | null, k: number, health = true): Promise<Person> {
  const user = await newUser(api, { health });
  const session = await newSession(api, user.deviceToken, { healthConsent: health, body: { ticker } });
  await answer(api, user.deviceToken, session.id, emp, () => k, { excludedAreas: health ? [] : ['B', 'M'] });
  const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
  if (done.status !== 200) throw new Error(`complete failed: ${done.text}`);
  return { userId: user.userId, token: user.deviceToken, sessionId: session.id, result: done.body.stored.result };
}

const sideOf = (ticker: string | null, result: any) => ({
  ticker,
  overall: result.overall,
  sectors: {
    C: result.sectors.C.price,
    W: result.sectors.W.price,
    N: result.sectors.N.price,
    B: result.sectors.B.price,
    M: result.sectors.M.price,
  },
  type: result.type,
});

const invite = (api: TestApi, token: string) => api.call('POST', '/api/compare/invites', { token });
const accept = (api: TestApi, token: string, code: unknown) => api.call('POST', '/api/compare/accept', { token, body: { code } });

describe('invites', () => {
  it('needs a completed check, returns the code once and stores only its hash', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const fresh = await newUser(api);
    const early = await invite(api, fresh.deviceToken);
    expect([early.status, early.body.error.code]).toEqual([409, 'check_required']);
    expect((await invite(api, '')).status).toBe(401);

    const a = await personWithCheck(api, 'AAA', 3);
    const res = await invite(api, a.token);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(res.body.expiresAt).toBe(new Date(Date.parse('2026-03-01T12:00:00.000Z') + COMPARE_INVITE_DAYS * DAY_MS).toISOString());

    const rows = await api.db.query<Record<string, unknown>>('select * from compare_invites');
    expect(rows).toEqual([
      {
        code_hash: await sha256Hex(res.body.code),
        user_id: a.userId,
        created_at: '2026-03-01T12:00:00.000Z',
        expires_at: res.body.expiresAt,
        accepted_at: null,
        pair_id: null,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(res.body.code);
    // Two invites never share a code.
    expect((await invite(api, a.token)).body.code).not.toBe(res.body.code);
  });

  it('lookup works without signing in and says who sent it, by ticker only', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const { code, expiresAt } = (await invite(api, a.token)).body;
    const lookup = (token: string | null, value: unknown) =>
      api.call('POST', '/api/compare/invites/lookup', { token, body: { code: value } });

    expect((await lookup(null, code)).body).toEqual({ status: 'open', expiresAt, fromTicker: 'AAA', own: false });
    expect((await lookup(b.token, code)).body.own).toBe(false);
    expect((await lookup(a.token, code)).body.own).toBe(true);
    expect((await lookup('not-a-token', code)).body.own).toBe(false);

    for (const bad of ['x'.repeat(22), 'short', '', 42, null]) {
      const res = await lookup(null, bad);
      expect([res.status, res.body.error.code], String(bad)).toEqual([404, 'invite_invalid']);
    }
    api.advance(COMPARE_INVITE_DAYS * DAY_MS);
    expect((await lookup(null, code)).body.status).toBe('expired');
  });

  it('holds at most a fixed number of unused invites; expired ones make room', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const a = await personWithCheck(api, null, 3);
    for (let i = 0; i < MAX_OPEN_INVITES; i += 1) expect((await invite(api, a.token)).status).toBe(201);
    const over = await invite(api, a.token);
    expect([over.status, over.body.error.code, over.body.error.details]).toEqual([429, 'invite_limit', { limit: MAX_OPEN_INVITES }]);
    api.advance(COMPARE_INVITE_DAYS * DAY_MS + 1);
    expect((await invite(api, a.token)).status).toBe(201);
    expect(await countRows(api.db, 'compare_invites', a.userId)).toBe(1);
  });
});

describe('accepting', () => {
  it('needs a completed check of the accepter, refuses your own invite, and works once', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const a = await personWithCheck(api, 'AAA', 3);
    const { code } = (await invite(api, a.token)).body;

    const own = await accept(api, a.token, code);
    expect([own.status, own.body.error.code]).toEqual([409, 'invite_own']);

    // Someone who opened the link before taking the check: not yet.
    const late = await newUser(api);
    const early = await accept(api, late.deviceToken, code);
    expect([early.status, early.body.error.code]).toEqual([409, 'check_required']);
    expect(await countRows(api.db, 'comparisons')).toBe(0);
    // Then they take the check and it works.
    const session = await newSession(api, late.deviceToken, { body: { ticker: 'LATE' } });
    await answer(api, late.deviceToken, session.id, emp, () => 1);
    await api.call('POST', `/api/sessions/${session.id}/complete`, { token: late.deviceToken });
    api.setNow('2026-03-02T09:00:00.000Z');
    const ok = await accept(api, late.deviceToken, code);
    expect(ok.status).toBe(201);
    expect(ok.body.created).toBe(true);
    expect(ok.body.comparison.createdAt).toBe('2026-03-02T09:00:00.000Z');
    expect(ok.body.comparison.other.ticker).toBe('AAA');
    expect(ok.body.comparison.me.ticker).toBe('LATE');

    // The code is used up, for the same person and for anyone else.
    const c = await personWithCheck(api, 'CCC', 2);
    for (const token of [late.deviceToken, c.token]) {
      const again = await accept(api, token, code);
      expect([again.status, again.body.error.code, again.body.error.details]).toEqual([410, 'invite_invalid', { status: 'accepted' }]);
    }
    expect(await countRows(api.db, 'comparisons')).toBe(2);
    expect((await accept(api, c.token, 'x'.repeat(22))).status).toBe(404);
    expect((await accept(api, '', code)).status).toBe(401);
  });

  it('an expired invite cannot be accepted', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const { code } = (await invite(api, a.token)).body;
    api.advance(COMPARE_INVITE_DAYS * DAY_MS);
    const res = await accept(api, b.token, code);
    expect([res.status, res.body.error.code, res.body.error.details]).toEqual([410, 'invite_invalid', { status: 'expired' }]);
    expect(await countRows(api.db, 'comparisons')).toBe(0);
  });

  it('two people have one comparison however many invites pass between them', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const first = await accept(api, b.token, (await invite(api, a.token)).body.code);
    const back = await accept(api, a.token, (await invite(api, b.token)).body.code);
    expect([back.status, back.body.created]).toEqual([200, false]);
    expect(back.body.comparison.id).toBe(first.body.comparison.id);
    expect(await countRows(api.db, 'comparisons')).toBe(2);
    expect((await api.call('GET', '/api/compare', { token: a.token })).body.openInvites).toEqual([]);
  });
});

describe('the comparison', () => {
  it('shows both sides to both people: ticker, overall, five sector prices, type', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, null, 1, false);
    const accepted = await accept(api, b.token, (await invite(api, a.token)).body.code);
    const id = accepted.body.comparison.id;

    const forB = await api.call('GET', `/api/compare/${id}`, { token: b.token });
    const forA = await api.call('GET', `/api/compare/${id}`, { token: a.token });
    expect(forB.status).toBe(200);
    expect(forB.body.comparison).toEqual({
      id,
      createdAt: accepted.body.comparison.createdAt,
      me: sideOf(null, b.result),
      other: sideOf('AAA', a.result),
    });
    expect(forA.body.comparison.me).toEqual(forB.body.comparison.other);
    expect(forA.body.comparison.other).toEqual(forB.body.comparison.me);
    // Without the health consent, body and mind have no price on that side.
    expect(forA.body.comparison.other.sectors).toMatchObject({ B: null, M: null });
    expect(a.result.overall).not.toBe(b.result.overall);

    const list = await api.call('GET', '/api/compare', { token: a.token });
    expect(list.body.comparisons).toEqual([forA.body.comparison]);
  });

  it('returns nothing else about the other person', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const accepted = await accept(api, b.token, (await invite(api, a.token)).body.code);
    const id = accepted.body.comparison.id;
    for (const res of [
      accepted,
      await api.call('GET', `/api/compare/${id}`, { token: b.token }),
      await api.call('GET', '/api/compare', { token: b.token }),
    ]) {
      const other = (res.body.comparison ?? res.body.comparisons[0]).other;
      expect(Object.keys(other).sort()).toEqual(['overall', 'sectors', 'ticker', 'type']);
      expect(Object.keys(other.sectors).sort()).toEqual(['B', 'C', 'M', 'N', 'W']);
      // No id of the other person or of their check, no answers, no grade, no internal values.
      expect(res.text).not.toContain(a.userId);
      expect(res.text).not.toContain(a.sessionId);
      for (const word of ['steps', 'grade', 'raw', 'flags', 'background', 'history', 'role', 'age']) {
        expect(res.text.includes(`"${word}"`), word).toBe(false);
      }
    }
  });

  it('follows a retake: each side is the latest completed check', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const id = (await accept(api, b.token, (await invite(api, a.token)).body.code)).body.comparison.id;

    api.setNow('2026-03-15T12:00:00.000Z');
    const retake = await newSession(api, a.token, { body: { ticker: 'ANEW' } });
    // An unfinished retake changes nothing.
    await answer(api, a.token, retake.id, emp, () => 0, { limit: 5 });
    expect((await api.call('GET', `/api/compare/${id}`, { token: b.token })).body.comparison.other).toEqual(sideOf('AAA', a.result));
    await answer(api, a.token, retake.id, emp, () => 0, {
      startSteps: (await api.call('GET', `/api/sessions/${retake.id}`, { token: a.token })).body.steps,
    });
    const done = await api.call('POST', `/api/sessions/${retake.id}/complete`, { token: a.token });
    const after = await api.call('GET', `/api/compare/${id}`, { token: b.token });
    expect(after.body.comparison.other).toEqual(sideOf('ANEW', done.body.stored.result));
    expect(after.body.comparison.other.overall).not.toBe(a.result.overall);
  });

  it('is not readable by anyone else', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const c = await personWithCheck(api, 'CCC', 2);
    const id = (await accept(api, b.token, (await invite(api, a.token)).body.code)).body.comparison.id;
    expect((await api.call('GET', `/api/compare/${id}`, { token: c.token })).status).toBe(404);
    expect((await api.call('POST', `/api/compare/${id}/delete`, { token: c.token })).status).toBe(404);
    expect((await api.call('GET', `/api/compare/${id}`, {})).status).toBe(401);
    expect((await api.call('GET', '/api/compare', { token: c.token })).body).toEqual({ comparisons: [], openInvites: [] });
    expect(await countRows(api.db, 'comparisons')).toBe(2);
  });
});

describe('deleting', () => {
  it('either person can delete the comparison, and it is gone for both', async () => {
    for (const who of ['inviter', 'friend'] as const) {
      const api = await makeApi();
      const a = await personWithCheck(api, 'AAA', 3);
      const b = await personWithCheck(api, 'BBB', 1);
      const id = (await accept(api, b.token, (await invite(api, a.token)).body.code)).body.comparison.id;
      const res = await api.call('POST', `/api/compare/${id}/delete`, { token: who === 'inviter' ? a.token : b.token });
      expect(res.body, who).toEqual({ deleted: true });
      for (const token of [a.token, b.token]) {
        expect((await api.call('GET', `/api/compare/${id}`, { token })).status).toBe(404);
        expect((await api.call('GET', '/api/compare', { token })).body.comparisons).toEqual([]);
      }
      expect(await countRows(api.db, 'comparisons')).toBe(0);
      expect(await countRows(api.db, 'compare_invites')).toBe(0);
      // The two results themselves are untouched, and they can compare again with a new invite.
      expect(await countRows(api.db, 'results')).toBe(2);
      expect((await accept(api, a.token, (await invite(api, b.token)).body.code)).status).toBe(201);
    }
  });

  it('deleting an account removes its invites and its comparisons on both sides', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    const b = await personWithCheck(api, 'BBB', 1);
    const c = await personWithCheck(api, 'CCC', 2);
    await accept(api, b.token, (await invite(api, a.token)).body.code);
    await accept(api, a.token, (await invite(api, c.token)).body.code);
    const open = (await invite(api, a.token)).body.code;
    const keep = (await accept(api, c.token, (await invite(api, b.token)).body.code)).body.comparison.id;

    const gone = await api.call('POST', '/api/me/delete', { token: a.token, body: { confirm: true } });
    expect(gone.body.rows).toMatchObject({ comparisons: 2, compare_invites: 2 });

    // a's open invite leads nowhere, and a is in nobody's comparisons.
    expect((await accept(api, b.token, open)).status).toBe(404);
    const rows = await api.db.query('select * from comparisons union all select null, user_id, null, null from compare_invites');
    expect(JSON.stringify(rows)).not.toContain(a.userId);
    for (const token of [b.token, c.token]) {
      const list = await api.call('GET', '/api/compare', { token });
      expect(list.body.comparisons.map((x: any) => x.id)).toEqual([keep]);
      expect(list.text).not.toContain('AAA');
    }
  });
});

describe('routes', () => {
  it('answers 405 for a known path with the wrong method', async () => {
    const api = await makeApi();
    const a = await personWithCheck(api, 'AAA', 3);
    for (const [method, path] of [
      ['GET', '/api/compare/invites'],
      ['GET', '/api/compare/accept'],
      ['GET', '/api/compare/invites/lookup'],
      ['POST', '/api/compare'],
      ['POST', '/api/compare/some-id'],
      ['GET', '/api/compare/some-id/delete'],
    ]) {
      const res = await api.call(method, path, { token: a.token });
      expect([res.status, res.body.error.code], `${method} ${path}`).toEqual([405, 'method_not_allowed']);
    }
  });
});
