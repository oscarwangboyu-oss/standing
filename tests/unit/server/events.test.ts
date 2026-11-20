// Question events (PROMPT.md section 7.1): uploaded as they happen, validated strictly against
// the bank and the path, idempotent on (session, seq, action), append only.

import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_SECONDS, MAX_EVENTS_PER_REQUEST, type QuestionEventInput } from '@/shared/api';
import { CURRENT, nextQuestion, type NextQuestion, type Step } from '@/engine';
import {
  answer,
  answerEvent,
  backgroundFor,
  bank,
  makeApi,
  newSession,
  newUser,
  shownEvent,
  stepFor,
  type TestApi,
} from './helpers/api';

const emp = backgroundFor('emp');

async function setup(): Promise<{ api: TestApi; token: string; sessionId: string; first: NextQuestion }> {
  const api = await makeApi();
  const user = await newUser(api);
  const session = await newSession(api, user.deviceToken);
  return { api, token: user.deviceToken, sessionId: session.id, first: nextQuestion(bank, emp, []) as NextQuestion };
}

function post(api: TestApi, token: string, sessionId: string, events: unknown[]) {
  return api.call('POST', `/api/sessions/${sessionId}/events`, { token, body: { events } });
}

describe('creating a session', () => {
  it('stores the background, state, ticker, language, bank version and consent flag', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const res = await api.call('POST', '/api/sessions', {
      token: user.deviceToken,
      body: {
        background: emp,
        usState: 'GA',
        ticker: 'bayu7',
        lang: 'zh',
        bankVersion: CURRENT.bank,
        healthConsent: true,
        localDate: '2026-03-01',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.session).toEqual({
      id: res.body.session.id,
      createdAt: '2026-03-01T12:00:00.000Z',
      completedAt: null,
      background: emp,
      usState: 'GA',
      ticker: 'BAYU7',
      lang: 'zh',
      bankVersion: '2.1',
      healthConsent: true,
      excludedAreas: [],
    });
    const me = await api.call('GET', '/api/me', { token: user.deviceToken });
    expect(me.body.user).toMatchObject({ ticker: 'BAYU7', usState: 'GA', age: 2, role: 'emp', lang: 'zh' });
    expect(me.body.openSession).toEqual({ id: res.body.session.id, createdAt: '2026-03-01T12:00:00.000Z', answered: 0 });
    // Starting a check counts as a visit on that day.
    expect(await api.db.query('select day from visits')).toEqual([{ day: '2026-03-01' }]);
  });

  it('the ticker is not unique', async () => {
    const api = await makeApi();
    const a = await newUser(api);
    const b = await newUser(api);
    await newSession(api, a.deviceToken, { body: { ticker: 'SAME' } });
    await newSession(api, b.deviceToken, { body: { ticker: 'SAME' } });
    expect((await api.db.query("select 1 from sessions where ticker = 'SAME'")).length).toBe(2);
  });

  it('rejects input that does not fit the bank', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const base = { background: emp, lang: 'en', bankVersion: CURRENT.bank, healthConsent: true };
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ ...base, bankVersion: '1.0' }, 409, 'bank_version_mismatch'],
      [{ ...base, background: { ...emp, role: 'king' } }, 400, 'invalid_request'],
      [{ ...base, background: { ...emp, age: 6 } }, 400, 'invalid_request'],
      [{ ...base, background: { ...emp, extra: { field: 0 } } }, 400, 'invalid_request'],
      [{ ...base, background: { ...emp, extra: { field: 14, stage: 2 } } }, 400, 'invalid_request'],
      [{ ...base, background: { ...emp, extra: { ...emp.extra, money: 0 } } }, 400, 'invalid_request'],
      [{ ...base, ticker: 'A' }, 400, 'invalid_request'],
      [{ ...base, ticker: 'TOOLONG7' }, 400, 'invalid_request'],
      [{ ...base, ticker: 'AB-C' }, 400, 'invalid_request'],
      [{ ...base, usState: 'ZZ' }, 400, 'invalid_request'],
      [{ ...base, lang: 'fr' }, 400, 'invalid_request'],
      [{ ...base, healthConsent: 'yes' }, 400, 'invalid_request'],
      [{ ...base, localDate: '01/01/2020' }, 400, 'invalid_request'],
    ];
    for (const [body, status, code] of cases) {
      const res = await api.call('POST', '/api/sessions', { token: user.deviceToken, body });
      expect([res.status, res.body.error.code], JSON.stringify(body)).toEqual([status, code]);
    }
    expect((await api.db.query('select 1 from sessions')).length).toBe(0);
  });

  it('starts a check on a device whose clock is days off, dated with the server day', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const body = { background: emp, lang: 'en', bankVersion: CURRENT.bank, healthConsent: true, localDate: '2020-01-01' };
    const res = await api.call('POST', '/api/sessions', { token: user.deviceToken, body });
    expect(res.status).toBe(201);
    expect(await api.db.query('select local_day from sessions')).toEqual([{ local_day: '2026-03-01' }]);
  });

  it('a retried request with the same client id does not create a second session', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const other = await newUser(api);
    const body = { id: 'client-made-id-0001', background: emp, lang: 'en', bankVersion: CURRENT.bank, healthConsent: true };
    const first = await api.call('POST', '/api/sessions', { token: user.deviceToken, body });
    const again = await api.call('POST', '/api/sessions', { token: user.deviceToken, body });
    expect([first.status, first.body.created]).toEqual([201, true]);
    expect([again.status, again.body.created]).toEqual([200, false]);
    expect(again.body.session).toEqual(first.body.session);
    const taken = await api.call('POST', '/api/sessions', { token: other.deviceToken, body });
    expect([taken.status, taken.body.error.code]).toEqual([409, 'id_conflict']);
    expect((await api.db.query('select 1 from sessions')).length).toBe(1);
  });
});

describe('storing events', () => {
  it('stores one row when a question is shown and one when it is answered, with every field', async () => {
    const { api, token, sessionId, first } = await setup();
    api.setNow('2026-03-01T12:00:05.000Z');
    const shown = await post(api, token, sessionId, [shownEvent(first, 0, { rng: 0.2, lang: 'zh' })]);
    expect(shown.body).toEqual({ results: [{ seq: 0, action: 'shown', status: 'stored' }], answered: 0, finished: false });
    api.setNow('2026-03-01T12:00:09.000Z');
    const event = answerEvent(first, 0, 3, { rng: 0.2, lang: 'zh', seconds: 3.75 });
    const answered = await post(api, token, sessionId, [event]);
    expect(answered.body).toEqual({ results: [{ seq: 0, action: 'select', status: 'stored' }], answered: 1, finished: false });

    const rows = await api.db.query('select * from question_events order by at');
    expect(rows).toEqual([
      {
        session_id: sessionId,
        seq: 0,
        action: 'shown',
        user_id: rows[0].user_id,
        item_id: 'C_lvl',
        version_key: 'base',
        lang: 'zh',
        option_index: null,
        seconds: null,
        display_direction: 'best_first',
        click_position: null,
        bank_version: '2.1',
        source: 'questionnaire',
        at: '2026-03-01T12:00:05.000Z',
      },
      {
        session_id: sessionId,
        seq: 0,
        action: 'select',
        user_id: rows[0].user_id,
        item_id: 'C_lvl',
        version_key: 'base',
        lang: 'zh',
        option_index: 3,
        seconds: 3.75,
        display_direction: 'best_first',
        // Five options shown best first: 4, 3, 2, 1, 0. Option 3 sits in the middle.
        click_position: 'middle',
        bank_version: '2.1',
        source: 'questionnaire',
        at: '2026-03-01T12:00:09.000Z',
      },
    ]);
  });

  it('is idempotent on (session, seq, action): a repeated event is a duplicate and adds no row', async () => {
    const { api, token, sessionId, first } = await setup();
    const shown = shownEvent(first, 0);
    const select = answerEvent(first, 0, 1);
    expect((await post(api, token, sessionId, [shown, select])).body.results.map((r: any) => r.status)).toEqual(['stored', 'stored']);
    for (let i = 0; i < 3; i++) {
      const again = await post(api, token, sessionId, [shown, select]);
      expect(again.status).toBe(200);
      expect(again.body.results.map((r: any) => r.status)).toEqual(['duplicate', 'duplicate']);
      expect(again.body.answered).toBe(1);
    }
    expect((await api.db.query('select 1 from question_events')).length).toBe(2);
  });

  it('the first answer to a question wins: a later select or skip for the same seq changes nothing', async () => {
    const { api, token, sessionId, first } = await setup();
    await post(api, token, sessionId, [shownEvent(first, 0), answerEvent(first, 0, 1)]);
    const other = await post(api, token, sessionId, [answerEvent(first, 0, 4)]);
    expect(other.body.results).toEqual([{ seq: 0, action: 'select', status: 'duplicate' }]);
    const skip = await post(api, token, sessionId, [answerEvent(first, 0, null)]);
    expect(skip.body.results).toEqual([{ seq: 0, action: 'skip', status: 'duplicate' }]);
    const rows = await api.db.query("select action, option_index from question_events where action <> 'shown'");
    expect(rows).toEqual([{ action: 'select', option_index: 1 }]);
  });

  it('takes an array, so an offline queue can flush a whole check at once', async () => {
    const { api, token, sessionId } = await setup();
    const steps: Step[] = [];
    const events: QuestionEventInput[] = [];
    for (;;) {
      const q = nextQuestion(bank, emp, steps);
      if (!q) break;
      const event = answerEvent(q, steps.length, steps.length % 5 === 4 ? null : 2);
      events.push(shownEvent(q, steps.length), event);
      steps.push(stepFor(event));
    }
    expect(events.length).toBe(68);
    const res = await post(api, token, sessionId, events);
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.status === 'stored')).toBe(true);
    expect(res.body).toMatchObject({ answered: 34, finished: true });
    expect((await api.db.query('select 1 from question_events')).length).toBe(68);

    const tooMany = await post(api, token, sessionId, Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => events[0]));
    expect(tooMany.status).toBe(400);
  });

  it('records a skip without an option', async () => {
    const { api, token, sessionId, first } = await setup();
    const res = await post(api, token, sessionId, [shownEvent(first, 0), answerEvent(first, 0, null, { seconds: 2 })]);
    expect(res.body.answered).toBe(1);
    const rows = await api.db.query("select action, option_index, seconds, click_position from question_events where action = 'skip'");
    expect(rows).toEqual([{ action: 'skip', option_index: null, seconds: 2, click_position: null }]);
  });
});

describe('validation against the bank', () => {
  it('rejects each kind of bad event, names it, and stores nothing', async () => {
    const { api, token, sessionId, first } = await setup();
    const good = answerEvent(first, 0, 1);
    const cases: Array<[string, Partial<Record<keyof QuestionEventInput, unknown>>, number, string]> = [
      ['unknown question', { itemId: 'ZZ9' }, 422, 'event_invalid'],
      ['unknown version key', { versionKey: 'nope' }, 422, 'event_invalid'],
      ['option index past the end', { optionIndex: 5 }, 422, 'event_invalid'],
      ['negative option index', { optionIndex: -1 }, 422, 'event_invalid'],
      ['fractional option index', { optionIndex: 1.5 }, 422, 'event_invalid'],
      ['select without an option', { optionIndex: null }, 422, 'event_invalid'],
      ['negative seconds', { seconds: -0.1 }, 422, 'event_invalid'],
      ['seconds beyond the bound', { seconds: MAX_ANSWER_SECONDS + 1 }, 422, 'event_invalid'],
      ['seconds missing on a select', { seconds: null }, 422, 'event_invalid'],
      ['seconds as text', { seconds: '3' }, 422, 'event_invalid'],
      ['unknown action', { action: 'peek' }, 422, 'event_invalid'],
      ['unknown language', { lang: 'fr' }, 422, 'event_invalid'],
      ['unknown display direction', { displayDirection: 'sideways' }, 422, 'event_invalid'],
      ['click position that does not match', { clickPosition: 'first' }, 422, 'event_invalid'],
      ['another bank version', { bankVersion: '1.0' }, 422, 'event_invalid'],
      ['negative seq', { seq: -1 }, 422, 'event_invalid'],
      ['a question that is not next on the path', { itemId: 'W1', versionKey: 'base', optionIndex: 1 }, 422, 'event_not_on_path'],
      ['an answer before the earlier question has one', { seq: 1 }, 409, 'event_out_of_order'],
    ];
    for (const [name, change, status, code] of cases) {
      const res = await post(api, token, sessionId, [{ ...good, ...change }]);
      expect([res.status, res.body.error.code], name).toEqual([status, code]);
      expect(res.body.error.details.index, name).toBe(0);
    }
    const shownWithOption = await post(api, token, sessionId, [{ ...shownEvent(first, 0), optionIndex: 1 }]);
    expect(shownWithOption.body.error.code).toBe('event_invalid');
    const shownWithSeconds = await post(api, token, sessionId, [{ ...shownEvent(first, 0), seconds: 1 }]);
    expect(shownWithSeconds.body.error.code).toBe('event_invalid');
    const empty = await post(api, token, sessionId, []);
    expect(empty.status).toBe(400);
    expect((await api.db.query('select 1 from question_events')).length).toBe(0);
  });

  it('checks the version key against the path, not only against the bank', async () => {
    const { api, token, sessionId } = await setup();
    // Answer up to the first wealth question, then W1. For an employee W1 is version "base";
    // "owner" exists in the bank but is not the version this person is asked.
    const steps = await answer(api, token, sessionId, emp, () => 2, { limit: 10 });
    const w1 = nextQuestion(bank, emp, steps) as NextQuestion;
    expect([w1.id, w1.key]).toEqual(['W1', 'base']);
    const owner = bank.items.W1.versions.find((v) => v.key === 'owner')!;
    const wrong = await post(api, token, sessionId, [answerEvent({ ...w1, key: 'owner', version: owner }, steps.length, 1)]);
    expect([wrong.status, wrong.body.error.code]).toEqual([422, 'event_not_on_path']);
    expect(wrong.body.error.details.expected).toEqual({ itemId: 'W1', versionKey: 'base' });
  });

  it('a batch is all or nothing: one bad event keeps the good ones out too', async () => {
    const { api, token, sessionId, first } = await setup();
    const res = await post(api, token, sessionId, [
      shownEvent(first, 0),
      answerEvent(first, 0, 1),
      { ...answerEvent(first, 1, 1), itemId: 'ZZ9' },
    ]);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ index: 2, seq: 1, action: 'select' });
    expect((await api.db.query('select 1 from question_events')).length).toBe(0);
  });

  it('a "shown" event may arrive again for an answered question, and only for the question that was there', async () => {
    const { api, token, sessionId, first } = await setup();
    await post(api, token, sessionId, [answerEvent(first, 0, 1)]);
    // The answer arrived without its "shown" (a lost request). The late "shown" is still taken.
    const late = await post(api, token, sessionId, [shownEvent(first, 0)]);
    expect(late.body.results).toEqual([{ seq: 0, action: 'shown', status: 'stored' }]);
    const second = nextQuestion(bank, emp, [stepFor(answerEvent(first, 0, 1))]) as NextQuestion;
    const wrongPlace = await post(api, token, sessionId, [shownEvent(second, 0)]);
    expect(wrongPlace.body.results).toEqual([{ seq: 0, action: 'shown', status: 'duplicate' }]);
  });
});

describe('ownership and state', () => {
  it("another person's session reads as not found", async () => {
    const { api, sessionId, first } = await setup();
    const stranger = await newUser(api);
    const res = await post(api, stranger.deviceToken, sessionId, [shownEvent(first, 0)]);
    expect([res.status, res.body.error.code]).toEqual([404, 'not_found']);
    expect((await api.call('GET', `/api/sessions/${sessionId}`, { token: stranger.deviceToken })).status).toBe(404);
    expect((await api.call('POST', `/api/sessions/${sessionId}/complete`, { token: stranger.deviceToken })).status).toBe(404);
    expect((await post(api, '', sessionId, [shownEvent(first, 0)])).status).toBe(401);
  });

  it('a completed check takes no new events but still answers repeats', async () => {
    const { api, token, sessionId } = await setup();
    const steps = await answer(api, token, sessionId, emp, () => 2);
    expect((await api.call('POST', `/api/sessions/${sessionId}/complete`, { token })).status).toBe(200);
    const last = nextQuestion(bank, emp, steps.slice(0, -1)) as NextQuestion;
    const repeat = await post(api, token, sessionId, [answerEvent(last, steps.length - 1, 2)]);
    expect(repeat.body.results).toEqual([{ seq: steps.length - 1, action: 'select', status: 'duplicate' }]);
    const extra = await post(api, token, sessionId, [shownEvent(last, steps.length)]);
    expect([extra.status, extra.body.error.code]).toEqual([409, 'session_completed']);
  });

  it('never stores an IP address or a user agent', async () => {
    const api = await makeApi();
    const columns = await api.db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public'",
    );
    const names = columns.map((c) => c.column_name);
    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((n) => /(^|_)(ip|addr|address|agent|ua|device_name|fingerprint)(_|$)/.test(n))).toEqual([]);
  });
});
