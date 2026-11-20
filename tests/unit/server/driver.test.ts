// The two database drivers must behave the same. Locally and in tests the server talks to PGlite;
// in production it talks to Supabase through postgres.js (src/server/db/postgres.ts). Here the
// production adapter runs over a wire bridge to the same PGlite, and the API must give the same
// answers through both: a full check, the micro apps, export, delete, and every team table.
//
// This caught JSON being encoded twice by postgres.js: every check failed at its first question
// on hosted Postgres while every PGlite test passed.

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BANKS, CURRENT, displayOrder, nextQuestion, orderDirection, whereOf, type Step } from '@/engine';
import type { Db } from '@/server/db';
import { readMigrationFiles } from '@/server/db/files';
import { migrate } from '@/server/db/migrate';
import { wrapPglite } from '@/server/db/pglite';
import { openPostgres, postgresOptions } from '@/server/db/postgres';
import { readEnv } from '@/server/env';
import { createApi } from '@/server/router';
import { CONSENT_VERSIONS } from '@/shared/api';
import { seedDemo } from '../../../scripts/lib/seed';
import { startBridge } from './helpers/bridge';

const NOW = new Date('2026-11-20T15:00:00.000Z');
const TODAY = '2026-11-20';
const PASS = 'driver test passphrase';

type Call = (method: string, path: string, opts?: { token?: string; body?: unknown }) => Promise<{ status: number; json: any }>;

function apiOver(db: Db): Call {
  const env = readEnv({ STANDING_ENV: 'local', ADMIN_PASSPHRASE: PASS });
  const handle = createApi({ db, env, now: () => new Date(NOW) });
  return async (method, path, opts = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await handle(
      new Request(`http://test.local${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    );
    const text = await res.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      // CSV or empty.
    }
    return { status: res.status, json };
  };
}

/** One person end to end. Returns what the flow saw, without ids and secrets. */
async function flow(call: Call): Promise<Record<string, unknown>> {
  const seen: Record<string, unknown> = {};
  const user = await call('POST', '/api/users', {
    body: { consent: { general: CONSENT_VERSIONS.general, health: CONSENT_VERSIONS.health }, lang: 'en' },
  });
  expect(user.status).toBe(201);
  const token = user.json.deviceToken as string;
  const bank = BANKS[CURRENT.bank];
  const extra: Record<string, number> = {};
  for (const q of bank.extra.emp) extra[q.id] = q.id === 'stage' ? 2 : 0;
  const background = { age: 2, role: 'emp' as const, extra };

  const created = await call('POST', '/api/sessions', {
    token,
    body: { background, lang: 'en', bankVersion: CURRENT.bank, healthConsent: true, localDate: TODAY },
  });
  expect(created.status).toBe(201);
  expect(created.json.session.background.extra).toEqual(extra);
  const sessionId = created.json.session.id as string;

  const steps: Step[] = [];
  for (let turn = 0; turn < 80; turn += 1) {
    const q = nextQuestion(bank, background, steps, {});
    if (!q) break;
    const seq = steps.length;
    const direction = orderDirection(0.7);
    const k = q.version.opts.length > 1 ? 1 : 0;
    const shown = {
      seq, action: 'shown', itemId: q.id, versionKey: q.key, lang: 'en', optionIndex: null, seconds: null,
      displayDirection: direction, clickPosition: null, bankVersion: CURRENT.bank,
    };
    const answer = { ...shown, action: 'select', optionIndex: k, seconds: 3, clickPosition: whereOf(k, displayOrder(q.version, 0.7)) };
    const posted = await call('POST', `/api/sessions/${sessionId}/events`, { token, body: { events: [shown, answer] } });
    expect(posted.status, `question ${seq}`).toBe(200);
    steps.push({ id: q.id, key: q.key, k, secs: 3, lang: 'en', order: direction, source: 'questionnaire', where: answer.clickPosition });
  }
  seen.answered = steps.length;

  const completed = await call('POST', `/api/sessions/${sessionId}/complete`, { token });
  expect(completed.status).toBe(200);
  seen.overall = completed.json.stored.result.overall;

  const me = await call('GET', `/api/me?today=${TODAY}`, { token });
  expect(me.status).toBe(200);
  expect(typeof me.json.latest.result).toBe('object');
  seen.live = me.json.live.today;

  const report = await call('POST', '/api/report-events', {
    token,
    body: { sessionId, events: [{ id: 'abcdefghijklmnop1', section: 'header', kind: 'seen' }] },
  });
  seen.report = report.status;
  seen.daily = (await call('POST', '/api/daily', { token, body: { localDate: TODAY, day: TODAY, sleep: 3, exercise: 2, state: 3 } })).status;
  seen.win = (
    await call('POST', '/api/weekly-wins', { token, body: { id: 'win_abcdefghijklmnop', localDate: TODAY, kind: 'certificate', exam: true, level: 'entry' } })
  ).status;
  seen.breakdown = (await call('GET', `/api/me/breakdown/day?today=${TODAY}&day=${TODAY}`, { token })).status;
  seen.invite = (await call('POST', '/api/compare/invites', { token, body: {} })).status;

  const exported = await call('GET', '/api/me/export', { token });
  expect(exported.status).toBe(200);
  expect(exported.json.tables.sessions[0].extra).toEqual(extra);
  expect(typeof exported.json.tables.results[0].result).toBe('object');
  seen.deleted = (await call('POST', '/api/me/delete', { token, body: { confirm: true } })).status;
  return seen;
}

describe('the production driver gives the same answers as the local one', () => {
  let raw: PGlite;
  let bridge: { port: number; close: () => void };
  let local: Call;
  let hosted: Call;

  beforeAll(async () => {
    raw = new PGlite();
    await raw.waitReady;
    const lite = wrapPglite(raw);
    await migrate(lite, readMigrationFiles(), () => NOW.toISOString());
    await seedDemo(lite, { seed: 4, people: 44, days: 30, now: NOW });
    bridge = await startBridge(raw);
    local = apiOver(lite);
    // One connection: the bridge serves a single PGlite session, so two connections would have
    // their protocol messages interleaved. What is tested is the SQL and the encoding, not the pool.
    hosted = apiOver(openPostgres(`postgres://postgres:postgres@127.0.0.1:${bridge.port}/postgres`, { max: 1 }));
  }, 120_000);

  afterAll(() => bridge?.close());

  it('a full check, the micro apps, export and delete', async () => {
    const onLocal = await flow(local);
    const onHosted = await flow(hosted);
    expect(onLocal.answered).toBeGreaterThan(30);
    expect(onHosted).toEqual(onLocal);
    expect(onHosted).toMatchObject({ report: 200, daily: 201, win: 201, breakdown: 200, invite: 201, deleted: 200 });
  }, 120_000);

  it('every team table', async () => {
    for (const table of ['overview', 'items', 'prices', 'norms', 'returns', 'report', 'daily', 'apps', 'gates', 'tests']) {
      const a = await local('GET', `/api/team/${table}`, { token: PASS });
      const b = await hosted('GET', `/api/team/${table}`, { token: PASS });
      expect(b.status, table).toBe(200);
      const strip = (x: any) => ({ ...x, generatedAt: null });
      expect(strip(b.json), table).toEqual(strip(a.json));
    }
  }, 120_000);

  it('connects with TLS to any host that is not this machine', () => {
    expect(postgresOptions('postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres').ssl).toBe('require');
    expect(postgresOptions('postgres://u:p@127.0.0.1:5432/x').ssl).toBe(false);
    expect(postgresOptions('postgres://u:p@localhost/x').ssl).toBe(false);
  });
});
