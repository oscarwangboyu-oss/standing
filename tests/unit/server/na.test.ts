// Not applicable: the third answer to a question, next to select and skip.
//
// The event is stored as action "na", gives a step without an option (reason "na"), and is
// counted apart from skips on the team's per-question table.

import { describe, expect, it } from 'vitest';
import { nextQuestion, type NextQuestion } from '@/engine';
import type { TeamItemRow } from '@/shared/api';
import type { Db } from '@/server/db';
import {
  answer,
  answerEvent,
  backgroundFor,
  bank,
  makeApi,
  naEvent,
  newSession,
  newUser,
  shownEvent,
  TEAM_PASSPHRASE,
  type TestApi,
} from './helpers/api';

const emp = backgroundFor('emp');

async function setup(): Promise<{ api: TestApi; token: string; sessionId: string; first: NextQuestion }> {
  const api = await makeApi();
  const user = await newUser(api);
  const session = await newSession(api, user.deviceToken);
  return { api, token: user.deviceToken, sessionId: session.id, first: nextQuestion(bank, emp, []) as NextQuestion };
}

const post = (api: TestApi, token: string, sessionId: string, events: unknown[]) =>
  api.call('POST', `/api/sessions/${sessionId}/events`, { token, body: { events } });

describe('the na event', () => {
  it('is stored, answers the question, and comes back as a step without an option', async () => {
    const { api, token, sessionId, first } = await setup();
    const res = await post(api, token, sessionId, [shownEvent(first, 0), naEvent(first, 0, { seconds: 3 })]);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { seq: 0, action: 'shown', status: 'stored' },
      { seq: 0, action: 'na', status: 'stored' },
    ]);
    expect(res.body.answered).toBe(1);

    const rows = await api.db.query('select action, option_index, seconds, click_position from question_events order by action');
    expect(rows).toEqual([
      { action: 'na', option_index: null, seconds: 3, click_position: null },
      { action: 'shown', option_index: null, seconds: null, click_position: null },
    ]);

    const session = await api.call('GET', `/api/sessions/${sessionId}`, { token });
    expect(session.body.steps).toEqual([
      { id: first.id, key: first.key, k: null, reason: 'na', secs: 3, lang: 'en', order: 'worst_first', source: 'questionnaire' },
    ]);
    expect(session.body.pending).toBeNull();
  });

  it('a skip keeps its own reason, so the two can be told apart', async () => {
    const { api, token, sessionId, first } = await setup();
    await post(api, token, sessionId, [answerEvent(first, 0, null)]);
    const session = await api.call('GET', `/api/sessions/${sessionId}`, { token });
    expect(session.body.steps[0]).toMatchObject({ k: null, reason: 'skip' });
  });

  it('may come without a time, and never carries an option or a click position', async () => {
    const { api, token, sessionId, first } = await setup();
    const na = naEvent(first, 0);
    expect((await post(api, token, sessionId, [{ ...na, optionIndex: 1 }])).body.error.code).toBe('event_invalid');
    expect((await post(api, token, sessionId, [{ ...na, clickPosition: 'first' }])).body.error.code).toBe('event_invalid');
    expect((await post(api, token, sessionId, [{ ...na, seconds: -1 }])).body.error.code).toBe('event_invalid');
    expect((await api.db.query('select 1 from question_events')).length).toBe(0);
    expect((await post(api, token, sessionId, [{ ...na, seconds: null }])).status).toBe(200);
  });

  it('a question has one answer: a skip or a selection after an na is a duplicate', async () => {
    const { api, token, sessionId, first } = await setup();
    await post(api, token, sessionId, [naEvent(first, 0)]);
    const again = await post(api, token, sessionId, [answerEvent(first, 0, null), answerEvent(first, 0, 1), naEvent(first, 0)]);
    expect(again.body.results.map((r: any) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    expect(await api.db.query("select action from question_events where action <> 'shown'")).toEqual([{ action: 'na' }]);
  });

  it('the database takes na and still refuses an unknown action', async () => {
    const { api, token, sessionId, first } = await setup();
    await post(api, token, sessionId, [naEvent(first, 0)]);
    await expect(api.db.query("update question_events set action = 'maybe'")).rejects.toThrow();
    // One answer per question holds for na too.
    await expect(
      api.db.query(
        `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, display_direction, bank_version, at)
         select session_id, seq, 'skip', user_id, item_id, version_key, lang, display_direction, bank_version, at from question_events`,
      ),
    ).rejects.toThrow();
    expect(token.length).toBeGreaterThan(0);
  });

  it('a check with not-applicable answers completes, and they count like skips in the result', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const viaNa = await newSession(api, user.deviceToken);
    // Mark every fifth question not applicable.
    const steps: number[] = [];
    for (;;) {
      const session = await api.call('GET', `/api/sessions/${viaNa.id}`, { token: user.deviceToken });
      const q = nextQuestion(bank, emp, session.body.steps);
      if (!q) break;
      const seq = session.body.steps.length;
      const event = seq % 5 === 0 ? naEvent(q, seq) : answerEvent(q, seq, 2);
      if (seq % 5 === 0) steps.push(seq);
      expect((await post(api, user.deviceToken, viaNa.id, [shownEvent(q, seq), event])).status).toBe(200);
    }
    const done = await api.call('POST', `/api/sessions/${viaNa.id}/complete`, { token: user.deviceToken });
    expect(done.status).toBe(200);
    expect(done.body.stored.result.counts.skipped).toBe(steps.length);

    // The same answers with skips in place of the na events give the same prices.
    const other = await newUser(api);
    const viaSkip = await newSession(api, other.deviceToken);
    await answer(api, other.deviceToken, viaSkip.id, emp, (_q, index) => (index % 5 === 0 ? null : 2), { seconds: 4 });
    const skipped = await api.call('POST', `/api/sessions/${viaSkip.id}/complete`, { token: other.deviceToken });
    expect(done.body.stored.result.overall).toBe(skipped.body.stored.result.overall);
    expect(done.body.stored.result.sectors).toEqual(skipped.body.stored.result.sectors);
  });
});

// ---------------------------------------------------------------- the team's numbers

// B4 has an option without a score (index 6). Ten people saw it, all role emp:
//   p1, p2       marked it not applicable
//   p3           chose option 6, the unscored one
//   p4           skipped it
//   p5..p9       chose options 0..4
//   p10          saw it two hours ago and left
// Not applicable: (2 marked + 1 unscored option) of 10 shown = 30%, above the 15% line.
// Skip: 1 of 10. Drop-off: 1 of 10. Answered (selected): 6.
async function build(db: Db, now: string): Promise<void> {
  const early = new Date(Date.parse(now) - 2 * 3600 * 1000).toISOString();
  for (let i = 1; i <= 10; i += 1) {
    const user = `p${i}`;
    const session = `sp${i}`;
    await db.query(
      `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version, general_consent_at, lang)
       values ($1, $2, $3, $2, 'general-1', $2, 'en')`,
      [user, early, `hash-${user}`],
    );
    await db.query(
      `insert into sessions (id, user_id, created_at, completed_at, local_day, age, role, extra, lang, bank_version, health_consent)
       values ($1, $2, $3, $4, $5, 2, 'emp', '{}', 'en', '2.1', true)`,
      [session, user, early, i === 10 ? null : early, early.slice(0, 10)],
    );
    const insert = `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, option_index,
        seconds, display_direction, click_position, bank_version, at)
      values ($1, 0, $2, $3, 'B4', 'base', 'en', $4, $5, 'worst_first', $6, '2.1', $7)`;
    await db.query(insert, [session, 'shown', user, null, null, null, early]);
    if (i <= 2) await db.query(insert, [session, 'na', user, null, 2, null, early]);
    else if (i === 3) await db.query(insert, [session, 'select', user, 6, 2, 'last', early]);
    else if (i === 4) await db.query(insert, [session, 'skip', user, null, 2, null, early]);
    else if (i <= 9) await db.query(insert, [session, 'select', user, i - 5, 2, 'middle', early]);
  }
}

describe('the per-question table', () => {
  it('counts the not-applicable share over those shown, apart from skips and drop-offs', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    await build(api.db, '2026-03-01T12:00:00.000Z');
    const res = await api.call('GET', '/api/team/items', { token: TEAM_PASSPHRASE });
    expect(res.status).toBe(200);
    const row = (res.body.rows as TeamItemRow[]).find((r) => r.itemId === 'B4') as TeamItemRow;
    expect(row.shown).toBe(10);
    expect(row.notApplicable).toEqual({ count: 3, of: 10, rate: 0.3, red: true, hasOption: true, marked: 2, unscoredOption: 1 });
    expect(row.skip).toEqual({ count: 1, of: 10, rate: 0.1, red: false });
    expect(row.dropOff).toEqual({ count: 1, of: 10, rate: 0.1, red: true });
    expect(row.answered).toBe(6);
    expect(row.options.counts).toEqual([1, 1, 1, 1, 1, 0, 1]);

    const csv = await api.call('GET', '/api/team/items?format=csv', { token: TEAM_PASSPHRASE });
    const [header, line] = csv.text.trimEnd().split('\r\n');
    const cells = line.split(',');
    const at = (name: string) => cells[header.split(',').indexOf(name)];
    expect([at('marked_not_applicable'), at('unscored_option'), at('not_applicable'), at('not_applicable_rate')]).toEqual(['2', '1', '3', '0.3']);
    expect([at('skipped'), at('dropped')]).toEqual(['1', '1']);
  });

  it('the highest skip rate of the overview does not count not-applicable answers', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    await build(api.db, '2026-03-01T12:00:00.000Z');
    const res = await api.call('GET', '/api/team/overview', { token: TEAM_PASSPHRASE });
    expect(res.body.status.maxItemSkipRate).toMatchObject({ value: 0.1, itemId: 'B4', met: true });
  });
});
