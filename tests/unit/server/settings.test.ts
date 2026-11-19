// Settings (PROMPT.md section 11): export all of my data, delete my data (really), plus the
// two small raw records that belong to a person: report events and visits.

import { describe, expect, it } from 'vitest';
import { REPORT_SECTIONS } from '@/shared/api';
import { USER_TABLES, USERS_TABLE } from '@/server/tables';
import { answer, backgroundFor, countRows, makeApi, newSession, newUser, type TestApi } from './helpers/api';

const emp = backgroundFor('emp');

/** A person with a completed check, an open check, report events, visits and a second device. */
async function personWithEverything(api: TestApi) {
  const user = await newUser(api);
  const token = user.deviceToken;
  const session = await newSession(api, token, { body: { ticker: 'KEEP', usState: 'GA' } });
  await answer(api, token, session.id, emp, () => 2);
  await api.call('POST', `/api/sessions/${session.id}/complete`, { token });
  const open = await newSession(api, token);
  await answer(api, token, open.id, emp, () => 1, { limit: 3 });
  await api.call('POST', '/api/report-events', {
    token,
    body: {
      sessionId: session.id,
      events: [
        { id: 'report-event-000001', section: 'chart', kind: 'seen' },
        { id: 'report-event-000002', section: 'chart', kind: 'dwell', ms: 4200 },
        { id: 'report-event-000003', section: 'chart', kind: 'useful', useful: true },
        { id: 'report-event-000004', section: 'share', kind: 'share' },
      ],
    },
  });
  await api.call('POST', '/api/visits', { token, body: { localDate: '2026-03-02' } });
  const second = await api.call('POST', '/api/restore', { body: { recoveryCode: user.recoveryCode } });
  return { user, token, session, open, secondToken: second.body.deviceToken as string };
}

describe('the list of personal tables', () => {
  it('covers every table of the schema that has a user_id column', async () => {
    const api = await makeApi();
    const rows = await api.db.query<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'user_id' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(USER_TABLES.map((t) => t.name).sort());
    // And nothing else in the schema: users itself and the migration log.
    const all = await api.db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(all.map((r) => r.table_name)).toEqual([...USER_TABLES.map((t) => t.name), USERS_TABLE.name, '_migrations'].sort());
  });
});

describe('export', () => {
  it('returns every row of the person and no hashes', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const { user, token, session, open } = await personWithEverything(api);
    const stranger = await personWithEverything(api);

    api.setNow('2026-03-01T13:00:00.000Z');
    const res = await api.call('GET', '/api/me/export', { token });
    expect(res.status).toBe(200);
    expect(res.body.exportedAt).toBe('2026-03-01T13:00:00.000Z');
    expect(Object.keys(res.body.tables).sort()).toEqual(USER_TABLES.map((t) => t.name).sort());
    expect(Object.keys(res.body.about).sort()).toEqual([...USER_TABLES.map((t) => t.name), 'users'].sort());

    for (const table of USER_TABLES) {
      expect(res.body.tables[table.name].length, table.name).toBe(await countRows(api.db, table.name, user.userId));
      expect(res.body.tables[table.name].length, table.name).toBeGreaterThan(0);
    }
    expect(res.body.user).toMatchObject({ id: user.userId, ticker: null, role: 'emp', lang: 'en' });
    expect(res.body.tables.sessions.map((s: any) => s.id).sort()).toEqual([session.id, open.id].sort());
    expect(res.body.tables.question_events.length).toBe(68 + 6);
    expect(res.body.tables.results.length).toBe(1);
    expect(res.body.tables.results[0].result.versions).toEqual({ algo: 1, bank: '2.1', norm: 'provisional-1' });
    expect(res.body.tables.report_events.length).toBe(4);
    expect(res.body.tables.visits.map((v: any) => v.day)).toEqual(['2026-03-01', '2026-03-02']);
    expect(res.body.tables.device_tokens.map((d: any) => d.origin)).toEqual(['create', 'restore']);
    expect(res.body.tables.consents.length).toBe(2);

    // No hashes, no secrets, and nothing of anyone else.
    expect(res.text).not.toContain('recovery_hash');
    expect(res.text).not.toContain('token_hash');
    expect(res.text).not.toContain(token);
    expect(res.text).not.toContain(user.recoveryCode);
    expect(res.text).not.toContain(stranger.user.userId);
    expect(res.text).not.toContain(stranger.session.id);
  });
});

describe('delete', () => {
  it('needs an explicit confirmation', async () => {
    const api = await makeApi();
    const { user, token } = await personWithEverything(api);
    const res = await api.call('POST', '/api/me/delete', { token, body: {} });
    expect(res.status).toBe(400);
    expect(await countRows(api.db, 'users', user.userId)).toBe(1);
  });

  it('leaves zero rows for that person in every table and does not touch anyone else', async () => {
    const api = await makeApi();
    const { user, token, secondToken } = await personWithEverything(api);
    const stranger = await personWithEverything(api);

    const tables = [...USER_TABLES.map((t) => t.name), 'users'];
    const before: Record<string, number> = {};
    const strangerBefore: Record<string, number> = {};
    for (const table of tables) {
      before[table] = await countRows(api.db, table, user.userId);
      strangerBefore[table] = await countRows(api.db, table, stranger.user.userId);
      expect(before[table], table).toBeGreaterThan(0);
    }

    const res = await api.call('POST', '/api/me/delete', { token, body: { confirm: true } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, rows: before });

    for (const table of tables) {
      expect(await countRows(api.db, table, user.userId), table).toBe(0);
      expect(await countRows(api.db, table, stranger.user.userId), table).toBe(strangerBefore[table]);
      expect(await countRows(api.db, table), table).toBe(strangerBefore[table]);
    }
    // No row anywhere still mentions the id, whatever the column.
    for (const table of tables) {
      const rows = await api.db.query(`select * from ${table}`);
      expect(JSON.stringify(rows)).not.toContain(user.userId);
    }

    // Both devices are signed out, and the recovery code no longer leads anywhere.
    expect((await api.call('GET', '/api/me', { token })).status).toBe(401);
    expect((await api.call('GET', '/api/me', { token: secondToken })).status).toBe(401);
    expect((await api.call('POST', '/api/restore', { body: { recoveryCode: user.recoveryCode } })).status).toBe(400);
    expect((await api.call('GET', '/api/me', { token: stranger.token })).status).toBe(200);
  });
});

describe('report events', () => {
  it('stores seen, dwell, share and the useful click per section, once per event id', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    const events = [
      { id: 'report-event-000001', section: 'sector_table', kind: 'seen' },
      { id: 'report-event-000002', section: 'sector_table', kind: 'dwell', ms: 5300 },
      { id: 'report-event-000003', section: 'share', kind: 'share' },
      { id: 'report-event-000004', section: 'sector_table', kind: 'useful', useful: false },
    ];
    const body = { sessionId: session.id, events };
    const first = await api.call('POST', '/api/report-events', { token: user.deviceToken, body });
    expect(first.body).toEqual({ stored: 4, duplicates: 0 });
    const again = await api.call('POST', '/api/report-events', { token: user.deviceToken, body });
    expect(again.body).toEqual({ stored: 0, duplicates: 4 });

    const rows = await api.db.query('select id, session_id, section, kind, ms, useful, at from report_events order by id');
    expect(rows).toEqual([
      { id: 'report-event-000001', session_id: session.id, section: 'sector_table', kind: 'seen', ms: null, useful: null, at: '2026-03-01T12:00:00.000Z' },
      { id: 'report-event-000002', session_id: session.id, section: 'sector_table', kind: 'dwell', ms: 5300, useful: null, at: '2026-03-01T12:00:00.000Z' },
      { id: 'report-event-000003', session_id: session.id, section: 'share', kind: 'share', ms: null, useful: null, at: '2026-03-01T12:00:00.000Z' },
      { id: 'report-event-000004', session_id: session.id, section: 'sector_table', kind: 'useful', ms: null, useful: false, at: '2026-03-01T12:00:00.000Z' },
    ]);
    // They are a separate record: nothing here touches the events that are scored.
    expect((await api.db.query('select 1 from question_events')).length).toBe(0);
  });

  it('rejects unknown sections, kinds and bad values', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    const stranger = await newUser(api);
    const session = await newSession(api, user.deviceToken);
    const send = (token: string, event: Record<string, unknown>) =>
      api.call('POST', '/api/report-events', { token, body: { sessionId: session.id, events: [event] } });
    const id = 'report-event-000009';
    expect((await send(user.deviceToken, { id, section: 'footer', kind: 'seen' })).status).toBe(400);
    expect((await send(user.deviceToken, { id, section: 'chart', kind: 'click' })).status).toBe(400);
    expect((await send(user.deviceToken, { id, section: 'chart', kind: 'dwell' })).status).toBe(400);
    expect((await send(user.deviceToken, { id, section: 'chart', kind: 'dwell', ms: -5 })).status).toBe(400);
    expect((await send(user.deviceToken, { id, section: 'chart', kind: 'useful' })).status).toBe(400);
    expect((await send(user.deviceToken, { id: 'short', section: 'chart', kind: 'seen' })).status).toBe(400);
    expect((await send(stranger.deviceToken, { id, section: 'chart', kind: 'seen' })).status).toBe(404);
    expect((await api.db.query('select 1 from report_events')).length).toBe(0);
    expect(REPORT_SECTIONS).toContain('chart');
  });
});

describe('visits', () => {
  it('keeps one row per person per local day', async () => {
    const api = await makeApi({ now: '2026-03-01T23:30:00.000Z' });
    const a = await newUser(api);
    const b = await newUser(api);
    const visit = (token: string, localDate: string) => api.call('POST', '/api/visits', { token, body: { localDate } });

    expect((await visit(a.deviceToken, '2026-03-01')).body).toEqual({ day: '2026-03-01', recorded: true });
    expect((await visit(a.deviceToken, '2026-03-01')).body).toEqual({ day: '2026-03-01', recorded: false });
    expect((await visit(b.deviceToken, '2026-03-01')).body).toEqual({ day: '2026-03-01', recorded: true });
    // The device's date may run a day ahead of or behind the server's UTC date.
    expect((await visit(a.deviceToken, '2026-03-02')).body.recorded).toBe(true);
    expect((await visit(a.deviceToken, '2026-02-28')).body.recorded).toBe(true);
    api.setNow('2026-03-02T23:30:00.000Z');
    expect((await visit(a.deviceToken, '2026-03-02')).body.recorded).toBe(false);

    const rows = await api.db.query<{ n: number }>('select count(*)::int as n from visits where user_id = $1', [a.userId]);
    expect(rows[0].n).toBe(3);
    expect(await countRows(api.db, 'visits', b.userId)).toBe(1);
  });

  it('rejects a date that is not a date or is more than a day from the server date', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const user = await newUser(api);
    const visit = (localDate: unknown) => api.call('POST', '/api/visits', { token: user.deviceToken, body: { localDate } });
    for (const bad of ['2026-03-03', '2026-02-27', '2025-03-01', '2026-02-30', '03/01/2026', '', null, 20260301]) {
      const res = await visit(bad);
      expect(res.status, String(bad)).toBe(400);
    }
    expect((await api.db.query('select 1 from visits')).length).toBe(0);
    expect((await api.call('POST', '/api/visits', { body: { localDate: '2026-03-01' } })).status).toBe(401);
  });
});
