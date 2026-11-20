// Consent in two steps (PROMPT.md section 11): the general consent, and a separate consent for
// body and mind answers. Without the second, the server takes nothing about sectors B and M.

import { describe, expect, it } from 'vitest';
import { CONSENT_VERSIONS } from '@/shared/api';
import { CURRENT, nextQuestion, type NextQuestion } from '@/engine';
import { answer, answerEvent, backgroundFor, bank, makeApi, newSession, newUser, shownEvent } from './helpers/api';

const emp = backgroundFor('emp');
const HEALTH = ['B', 'M'] as const;

/** A NextQuestion for a body question, as a client that ignored the consent would send it. */
function bodyQuestion(): NextQuestion {
  const version = bank.items.B1.versions[0];
  return { id: 'B1', key: version.key, version, section: 'B', index: 0, total: 34 };
}

describe('recording consent', () => {
  it('stores the text version and the time of each consent', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api, { health: false });
    expect(user.consent.health).toBeNull();

    api.setNow('2026-03-02T08:30:00.000Z');
    const granted = await api.call('POST', '/api/consent', {
      token: user.deviceToken,
      body: { kind: 'health', granted: true, version: CONSENT_VERSIONS.health },
    });
    expect(granted.status).toBe(200);
    expect(granted.body.consent).toEqual({
      general: { version: 'general-1', at: '2026-03-01T12:00:00.000Z' },
      health: { version: 'health-1', at: '2026-03-02T08:30:00.000Z' },
    });

    api.setNow('2026-03-03T09:00:00.000Z');
    const withdrawn = await api.call('POST', '/api/consent', {
      token: user.deviceToken,
      body: { kind: 'health', granted: false, version: CONSENT_VERSIONS.health },
    });
    expect(withdrawn.body.consent.health).toBeNull();

    const log = await api.db.query('select kind, granted, text_version, at from consents order by at');
    expect(log).toEqual([
      { kind: 'general', granted: true, text_version: 'general-1', at: '2026-03-01T12:00:00.000Z' },
      { kind: 'health', granted: true, text_version: 'health-1', at: '2026-03-02T08:30:00.000Z' },
      { kind: 'health', granted: false, text_version: 'health-1', at: '2026-03-03T09:00:00.000Z' },
    ]);
  });

  it('saves nothing without the general consent, and rejects unknown text versions', async () => {
    const api = await makeApi();
    const none = await api.call('POST', '/api/users', { body: { consent: { general: null, health: null }, lang: 'en' } });
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('consent_required');
    const unknown = await api.call('POST', '/api/users', { body: { consent: { general: 'general-999', health: null }, lang: 'en' } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('consent_version_unknown');
    expect((await api.db.query('select 1 from users')).length).toBe(0);

    const user = await newUser(api, { health: false });
    const badHealth = await api.call('POST', '/api/consent', {
      token: user.deviceToken,
      body: { kind: 'health', granted: true, version: 'health-999' },
    });
    expect(badHealth.body.error.code).toBe('consent_version_unknown');
    // The general consent is withdrawn by deleting the data, not here.
    const general = await api.call('POST', '/api/consent', {
      token: user.deviceToken,
      body: { kind: 'general', granted: false, version: CONSENT_VERSIONS.general },
    });
    expect(general.status).toBe(400);
  });
});

describe('without the health consent', () => {
  it('a session cannot claim it', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: false });
    const res = await api.call('POST', '/api/sessions', {
      token: user.deviceToken,
      body: { background: emp, lang: 'en', bankVersion: CURRENT.bank, healthConsent: true },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('health_consent_required');
    expect((await api.db.query('select 1 from sessions')).length).toBe(0);
  });

  it('events for body and mind questions are rejected and nothing is stored', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: false });
    const session = await newSession(api, user.deviceToken, { healthConsent: false });
    expect(session.excludedAreas).toEqual(['B', 'M']);

    for (const id of ['B1', 'B3', 'M1', 'M6']) {
      const version = bank.items[id].versions[0];
      const q: NextQuestion = { ...bodyQuestion(), id, key: version.key, version };
      for (const event of [shownEvent(q, 0), answerEvent(q, 0, 1), answerEvent(q, 0, null)]) {
        const res = await api.call('POST', `/api/sessions/${session.id}/events`, {
          token: user.deviceToken,
          body: { events: [event] },
        });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('health_consent_required');
        expect(res.body.error.details.itemId).toBe(id);
      }
    }
    expect((await api.db.query('select 1 from question_events')).length).toBe(0);
  });

  it('the other three sectors complete; body and mind are unlisted', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: false });
    const session = await newSession(api, user.deviceToken, { healthConsent: false });
    const steps = await answer(api, user.deviceToken, session.id, emp, () => 2, { excludedAreas: [...HEALTH] });
    expect(steps.length).toBe(23);
    expect(steps.some((s) => HEALTH.includes(bank.items[s.id].area as 'B' | 'M'))).toBe(false);

    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(done.status).toBe(200);
    const result = done.body.stored.result;
    expect(result.sectors.B.status).toBe('unlisted');
    expect(result.sectors.M.status).toBe('unlisted');
    expect(result.sectors.B.price).toBeNull();
    expect(result.overallCovers).toEqual(['C', 'W', 'N']);
    const areas = await api.db.query<{ item_id: string }>('select distinct item_id from question_events');
    expect(areas.filter((r) => HEALTH.includes(bank.items[r.item_id].area as 'B' | 'M'))).toEqual([]);
  });
});

describe('with the health consent', () => {
  it('body and mind questions are part of the check', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: true });
    const session = await newSession(api, user.deviceToken, { healthConsent: true });
    expect(session.excludedAreas).toEqual([]);
    const steps = await answer(api, user.deviceToken, session.id, emp, () => 2);
    expect(steps.length).toBe(34);
    expect(steps.filter((s) => bank.items[s.id].area === 'B').length).toBe(5);
    expect(steps.filter((s) => bank.items[s.id].area === 'M').length).toBe(6);
  });

  it('a person who has it may still start a check without body and mind', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: true });
    const session = await newSession(api, user.deviceToken, { healthConsent: false });
    const res = await api.call('POST', `/api/sessions/${session.id}/events`, {
      token: user.deviceToken,
      body: { events: [shownEvent(bodyQuestion(), 0)] },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('health_consent_required');
  });

  it('withdrawing it mid-check stops body and mind answers and the check goes on with three sectors', async () => {
    const api = await makeApi();
    const user = await newUser(api, { health: true });
    const session = await newSession(api, user.deviceToken, { healthConsent: true });
    // Answer up to and including the first body question (22 questions come before body for this role).
    const before = await answer(api, user.deviceToken, session.id, emp, () => 2, { limit: 23 });
    expect(before[before.length - 1].id).toBe('B1');
    const nextBody = nextQuestion(bank, emp, before) as NextQuestion;
    expect(nextBody.section).toBe('B');

    const withdrawn = await api.call('POST', '/api/consent', {
      token: user.deviceToken,
      body: { kind: 'health', granted: false, version: CONSENT_VERSIONS.health },
    });
    expect(withdrawn.body.consent.health).toBeNull();

    const rejected = await api.call('POST', `/api/sessions/${session.id}/events`, {
      token: user.deviceToken,
      body: { events: [shownEvent(nextBody, before.length), answerEvent(nextBody, before.length, 2)] },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('health_consent_required');

    // The session now leaves body and mind out. The client resumes from the stored steps.
    const resumed = await api.call('GET', `/api/sessions/${session.id}`, { token: user.deviceToken });
    expect(resumed.body.session.healthConsent).toBe(false);
    expect(resumed.body.session.excludedAreas).toEqual(['B', 'M']);
    expect(resumed.body.steps.length).toBe(23);
    const after = await answer(api, user.deviceToken, session.id, emp, () => 2, {
      excludedAreas: [...HEALTH],
      startSteps: resumed.body.steps,
    });
    expect(after[after.length - 1].id).toBe('G1');

    const done = await api.call('POST', `/api/sessions/${session.id}/complete`, { token: user.deviceToken });
    expect(done.status).toBe(200);
    expect(done.body.stored.result.sectors.B.status).toBe('unlisted');
    expect(done.body.stored.result.sectors.M.status).toBe('unlisted');
    expect(done.body.stored.result.sectors.W.status).toBe('listed');
  });
});

describe('withdrawing the Body and Mind consent', () => {
  it('takes effect at once: the live price, Why it moved and a friend leave Body and Mind out', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const me = await newUser(api, { health: true });
    const friend = await newUser(api, { health: true });
    const { completedCheck, today } = await import('./helpers/api');
    await completedCheck(api, me.deviceToken, { healthConsent: true, choose: () => 2 });
    await completedCheck(api, friend.deviceToken, { healthConsent: true });
    const daily = await api.call('POST', '/api/daily', {
      token: me.deviceToken,
      body: { localDate: today(api), day: today(api), sleep: 3, exercise: 3, state: 3 },
    });
    expect(daily.status).toBe(201);

    // Before: five sectors everywhere.
    const before = await api.call('GET', `/api/me?today=${today(api)}`, { token: me.deviceToken });
    for (const area of HEALTH) expect(before.body.live.sectors[area].status, area).toBe('listed');
    const made = await api.call('POST', '/api/compare/invites', { token: me.deviceToken });
    const accepted = await api.call('POST', '/api/compare/accept', { token: friend.deviceToken, body: { code: made.body.code } });
    expect(accepted.status).toBe(201);
    const id = accepted.body.comparison.id as string;
    const seenBefore = await api.call('GET', `/api/compare/${id}`, { token: friend.deviceToken });
    const mine = (body: any) => body.comparison.other;
    expect(seenBefore.status).toBe(200);
    expect(mine(seenBefore.body).sectors.B).not.toBeNull();

    const withdrawn = await api.call('POST', '/api/consent', {
      token: me.deviceToken,
      body: { kind: 'health', granted: false, version: CONSENT_VERSIONS.health },
    });
    expect(withdrawn.status).toBe(200);

    // After: Body and Mind are not listed in the live price, and the overall is the mean of three.
    const after = await api.call('GET', `/api/me?today=${today(api)}`, { token: me.deviceToken });
    expect(after.status).toBe(200);
    for (const area of HEALTH) {
      expect(after.body.live.sectors[area].status, area).toBe('unlisted');
      expect(after.body.live.sectors[area].price, area).toBeNull();
    }
    const three = (['C', 'W', 'N'] as const).map((a) => after.body.live.sectors[a].price as number);
    expect(after.body.live.overall.covers).toEqual(['C', 'W', 'N']);
    expect(after.body.live.overall.price).toBeCloseTo(three.reduce((x, y) => x + y, 0) / 3, 1);
    // The Daily Open is closed to them and their records no longer count.
    expect(after.body.live.apps.dailyOpen.available).toBe(false);
    const day = await api.call('GET', `/api/me/breakdown/day?today=${today(api)}&day=${today(api)}`, { token: me.deviceToken });
    expect(day.status).toBe(200);
    // The friend sees three sectors, and an overall price made from those three.
    const seenAfter = await api.call('GET', `/api/compare/${id}`, { token: friend.deviceToken });
    const them = mine(seenAfter.body);
    expect(them.sectors.B).toBeNull();
    expect(them.sectors.M).toBeNull();
    const theirs = (['C', 'W', 'N'] as const).map((a) => them.sectors[a] as number);
    expect(them.overall).toBeCloseTo(theirs.reduce((x, y) => x + y, 0) / 3, 6);
    if (them.type) for (const area of them.type) expect(HEALTH).not.toContain(area);
    // Nothing was deleted: the raw records stay until the person deletes their data.
    expect((await api.db.query("select 1 from daily_entries")).length).toBe(1);
    // The team's norm table counts their Body and Mind no more: only the friend's are left.
    const { TEAM_PASSPHRASE } = await import('./helpers/api');
    const norms = await api.call('GET', '/api/team/norms', { token: TEAM_PASSPHRASE });
    const everyone = (area: string) => norms.body.rows.find((r: any) => r.role === null && r.age === null && r.area === area);
    expect(everyone('B')?.n).toBe(1);
    expect(everyone('C')?.n).toBe(2);
  });
});
