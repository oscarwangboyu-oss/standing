// The four micro apps: raw, append-only records behind a switch each. Strict input: taps,
// bands, categories and counts, nothing else. Payday takes bands only and no table can hold
// an amount.

import { beforeAll, describe, expect, it } from 'vitest';
import { PAYDAY_ENTRY_FIELDS } from '@/shared/api';
import { readEnv } from '@/server/env';
import { buildBatches, type FunnelEvent } from '@/server/posthog';
import { createApi } from '@/server/router';
import { completedCheck, countRows, makeApi, newUser, today, type TestApi } from './helpers/api';

const NOW = '2026-03-02T12:00:00.000Z';
const DAY = '2026-03-02';
const MICRO_TABLES = ['daily_entries', 'payday_entries', 'weekly_wins', 'people_nudges'] as const;

const daily = (extra: Record<string, unknown> = {}) => ({ localDate: DAY, sleep: 3, exercise: 2, state: 4, ...extra });
const payday = (extra: Record<string, unknown> = {}) => ({
  id: 'payday-entry-000001',
  localDate: DAY,
  periods: 2,
  saveShare: 3,
  runway: null,
  baselineDay: null,
  ...extra,
});
const win = (extra: Record<string, unknown> = {}) => ({ id: 'weekly-win-0000001', localDate: DAY, kind: 'skill', ...extra });
const nudge = (extra: Record<string, unknown> = {}) => ({
  id: 'people-nudge-00001',
  localDate: DAY,
  planned: 3,
  reached: ['friend', 'mentor'],
  ...extra,
});

const ENDPOINTS: Array<[string, () => Record<string, unknown>]> = [
  ['/api/daily', daily],
  ['/api/payday', payday],
  ['/api/weekly-wins', win],
  ['/api/people-nudges', nudge],
];

describe('switches, sign-in and the first check', () => {
  it('GET /api/config lists the four switches, on locally and off in production', async () => {
    const local = await makeApi();
    expect((await local.call('GET', '/api/config')).body.flags).toEqual({ dailyOpen: true, payday: true, weeklyWin: true, peopleNudge: true });
    const production = await makeApi({ vars: { STANDING_ENV: 'production' } });
    expect((await production.call('GET', '/api/config')).body.flags).toEqual({ dailyOpen: false, payday: false, weeklyWin: false, peopleNudge: false });
    const mixed = await makeApi({ vars: { STANDING_ENV: 'production', FLAG_DAILY_OPEN: 'on', FLAG_WEEKLY_WIN: 'on' } });
    expect((await mixed.call('GET', '/api/config')).body.flags).toEqual({ dailyOpen: true, payday: false, weeklyWin: true, peopleNudge: false });
  });

  it('each endpoint answers feature_off while its own switch is off, and stores nothing', async () => {
    const api = await makeApi({
      now: NOW,
      vars: { FLAG_DAILY_OPEN: 'off', FLAG_PAYDAY: 'off', FLAG_WEEKLY_WIN: 'off', FLAG_PEOPLE_NUDGE: 'off' },
    });
    const user = await newUser(api);
    await completedCheck(api, user.deviceToken);
    for (const [path, body] of ENDPOINTS) {
      const res = await api.call('POST', path, { token: user.deviceToken, body: body() });
      expect([path, res.status, res.body.error.code]).toEqual([path, 403, 'feature_off']);
    }
    for (const table of MICRO_TABLES) expect(await countRows(api.db, table), table).toBe(0);
    // The home page read still works and says the apps are off.
    const me = await api.call('GET', `/api/me?today=${DAY}`, { token: user.deviceToken });
    expect(me.body.live.apps.dailyOpen).toMatchObject({ enabled: false, available: false });
    expect(me.body.live.apps.payday).toMatchObject({ enabled: false, available: false, eligible: true });

    // One switch on: only that endpoint opens.
    const one = await makeApi({ now: NOW, vars: { FLAG_DAILY_OPEN: 'off', FLAG_PAYDAY: 'off', FLAG_PEOPLE_NUDGE: 'off' } });
    const other = await newUser(one);
    await completedCheck(one, other.deviceToken);
    expect((await one.call('POST', '/api/weekly-wins', { token: other.deviceToken, body: win() })).status).toBe(201);
    expect((await one.call('POST', '/api/people-nudges', { token: other.deviceToken, body: nudge() })).status).toBe(403);
  });

  it('needs a device token and a completed check', async () => {
    const api = await makeApi({ now: NOW });
    const user = await newUser(api);
    for (const [path, body] of ENDPOINTS) {
      expect((await api.call('POST', path, { body: body() })).status, path).toBe(401);
      const res = await api.call('POST', path, { token: user.deviceToken, body: body() });
      expect([path, res.status, res.body.error.code]).toEqual([path, 409, 'check_required']);
      expect((await api.call('GET', path, { token: user.deviceToken })).status, path).toBe(405);
    }
    for (const table of MICRO_TABLES) expect(await countRows(api.db, table), table).toBe(0);
  });
});

describe('POST /api/daily', () => {
  let api: TestApi;
  let token: string;
  let userId: string;
  const post = (body: Record<string, unknown>) => api.call('POST', '/api/daily', { token, body });

  beforeAll(async () => {
    api = await makeApi({ now: NOW });
    const user = await newUser(api);
    token = user.deviceToken;
    userId = user.userId;
    await completedCheck(api, token);
  });

  it('rejects anything that is not three taps', async () => {
    const bad: Array<Record<string, unknown>> = [
      daily({ note: 'slept badly' }),
      daily({ sleepHours: 7.5 }),
      daily({ sleep: 5 }),
      daily({ sleep: -1 }),
      daily({ exercise: 2.5 }),
      daily({ state: '4' }),
      { localDate: DAY, sleep: null, exercise: null, state: null },
      { sleep: 3, exercise: 2, state: 4 },
      daily({ localDate: 'today' }),
      daily({ day: '02/03/2026' }),
    ];
    for (const body of bad) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([JSON.stringify(body), 400, 'invalid_request']);
    }
    // A device clock days off: nothing is stored, and the answer says why.
    const skewed = await post(daily({ localDate: '2026-03-09' }));
    expect([skewed.status, skewed.body.error.code]).toEqual([400, 'clock_skew']);
    expect(skewed.body.error.details.serverDate).toBe(DAY);
    // Only today and yesterday are open.
    for (const day of ['2026-02-28', '2026-03-03']) {
      const res = await post(daily({ day }));
      expect([day, res.status, res.body.error.code]).toEqual([day, 409, 'day_closed']);
    }
    expect(await countRows(api.db, 'daily_entries')).toBe(0);
  });

  it('stores one entry per day, lets yesterday be filled in, and never changes a stored row', async () => {
    const first = await post(daily());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ stored: true, day: DAY });
    // The check was taken today, so yesterday is not offered; the server still takes it if sent.
    expect(first.body.live.streak).toMatchObject({ current: 1, recordedToday: true, canBackfill: [] });
    expect(first.body.live.apps.dailyOpen).toMatchObject({ enabled: true, available: true, recordedToday: true, lastDay: DAY });

    // A second entry for the same day is not stored: the first one stands.
    const again = await post(daily({ sleep: 0, exercise: 0, state: 0 }));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ stored: false, day: DAY });

    // Yesterday, entered today. A tap can be left out.
    const back = await post({ localDate: DAY, day: '2026-03-01', sleep: 2, exercise: null, state: 1 });
    expect(back.status).toBe(201);
    expect(back.body).toMatchObject({ stored: true, day: '2026-03-01' });
    expect(back.body.live.streak).toMatchObject({ current: 2, recordedToday: true, canBackfill: [] });

    const rows = await api.db.query('select user_id, day, logged_on, sleep, exercise, state, source, at from daily_entries order by day');
    expect(rows).toEqual([
      { user_id: userId, day: '2026-03-01', logged_on: DAY, sleep: 2, exercise: null, state: 1, source: 'daily_open', at: NOW },
      { user_id: userId, day: DAY, logged_on: DAY, sleep: 3, exercise: 2, state: 4, source: 'daily_open', at: NOW },
    ]);
  });

  it('needs the health consent: without it nothing is stored, and the other apps stay open', async () => {
    const user = await newUser(api, { health: false });
    await completedCheck(api, user.deviceToken, { healthConsent: false });
    const res = await api.call('POST', '/api/daily', { token: user.deviceToken, body: daily() });
    expect([res.status, res.body.error.code]).toEqual([403, 'health_consent_required']);
    expect(await countRows(api.db, 'daily_entries', user.userId)).toBe(0);
    const other = await api.call('POST', '/api/weekly-wins', { token: user.deviceToken, body: win() });
    expect(other.status).toBe(201);
    expect(other.body.live.apps.dailyOpen).toMatchObject({ enabled: true, available: false });
    expect(other.body.live.sectors.B.status).toBe('unlisted');

    // Withdrawing the consent later closes the daily open at once.
    const withdrawn = await api.call('POST', '/api/consent', { token, body: { kind: 'health', granted: false, version: 'health-1' } });
    expect(withdrawn.status).toBe(200);
    const closed = await post(daily({ localDate: DAY }));
    expect([closed.status, closed.body.error.code]).toEqual([403, 'health_consent_required']);
  });
});

describe('POST /api/payday: bands only', () => {
  let api: TestApi;
  let token: string;
  let userId: string;
  const post = (body: Record<string, unknown>) => api.call('POST', '/api/payday', { token, body });

  beforeAll(async () => {
    api = await makeApi({ now: NOW });
    const user = await newUser(api);
    token = user.deviceToken;
    userId = user.userId;
    await completedCheck(api, token);
  });

  it('refuses any payload that carries an amount, in any field and in any form', async () => {
    const withAmounts: Array<Record<string, unknown>> = [
      payday({ income: 2400 }),
      payday({ spending: 1800.5 }),
      payday({ savings: 300 }),
      payday({ amount: 2400 }),
      payday({ amounts: { income: 2400, spending: 1800, savings: 300 } }),
      payday({ essentialMonthly: 1500 }),
      payday({ setup: { frequency: 'monthly', essentialMonthly: 1500 } }),
      payday({ cashOnHand: 5200, debtPaid: 150, saved: 300 }),
      payday({ note: '$2,400' }),
      // An amount put into a band field.
      payday({ periods: 2400 }),
      payday({ saveShare: 0.125 }),
      payday({ saveShare: 300 }),
      payday({ saveShare: '12%' }),
      payday({ runway: 5200 }),
      payday({ runway: 2.5 }),
      payday({ runway: { months: 3 } }),
    ];
    for (const body of withAmounts) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([JSON.stringify(body), 400, 'amounts_not_accepted']);
    }
    expect(await countRows(api.db, 'payday_entries')).toBe(0);
    // The request has six fields, and none of them is an amount.
    expect([...PAYDAY_ENTRY_FIELDS]).toEqual(['id', 'localDate', 'periods', 'saveShare', 'runway', 'baselineDay']);
  });

  it('no micro-app table has a column that could hold an amount, a name or free text', async () => {
    const columns = await api.db.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = any($1) order by table_name, ordinal_position`,
      [[...MICRO_TABLES]],
    );
    expect(new Set(columns.map((c) => c.table_name))).toEqual(new Set(MICRO_TABLES));
    // Only small whole numbers, booleans and text. No numeric, real, double precision, money, integer or bigint.
    expect([...new Set(columns.map((c) => c.data_type))].sort()).toEqual(['boolean', 'smallint', 'text']);
    for (const c of columns) {
      expect(c.column_name, `${c.table_name}.${c.column_name}`).not.toMatch(/amount|income|spend|saving|cash|debt|dollar|usd|balance|name|title|note|text/);
    }
    expect(columns.filter((c) => c.table_name === 'payday_entries').map((c) => c.column_name)).toEqual([
      'user_id', 'id', 'day', 'periods', 'save_share', 'runway', 'baseline_day', 'source', 'at',
    ]);

    // Every number column is bounded by a check: even written straight into the database, a
    // value the size of an amount is refused.
    const numbers = columns.filter((c) => c.data_type === 'smallint');
    expect(numbers.length).toBeGreaterThan(10);
    const base: Record<string, string> = {
      daily_entries: `insert into daily_entries (user_id, day, logged_on, sleep, exercise, state, at) values ('${userId}', '2026-01-01', '2026-01-01', 1, 1, 1, 'x')`,
      payday_entries: `insert into payday_entries (user_id, id, day, periods, save_share, runway, at) values ('${userId}', 'x', '2026-01-01', 1, 1, 1, 'x')`,
      weekly_wins: `insert into weekly_wins (user_id, id, day, kind, hours, at) values ('${userId}', 'x', '2026-01-01', 'course', 1, 'x')`,
      people_nudges: `insert into people_nudges (user_id, id, day, planned, reached_family, reached_friend, reached_mentor, reached_work, reached_other, at) values ('${userId}', 'x', '2026-01-01', 1, 1, 1, 1, 1, 1, 'x')`,
    };
    for (const c of numbers) {
      for (const amount of [13, 250, 2400]) {
        // Replace the value of this one column with an amount.
        const sql = base[c.table_name];
        const names = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(', ');
        const values = sql.slice(sql.lastIndexOf('(') + 1, sql.lastIndexOf(')')).split(', ');
        values[names.indexOf(c.column_name)] = String(amount);
        const statement = `${sql.slice(0, sql.lastIndexOf('('))}(${values.join(', ')})`;
        await expect(api.db.query(statement), `${c.table_name}.${c.column_name} = ${amount}`).rejects.toThrow(/check constraint/);
      }
    }
    // The text columns with a fixed vocabulary refuse anything else.
    await expect(api.db.query(base.weekly_wins.replace("'course'", "'Intro to Statistics'"))).rejects.toThrow(/check constraint/);
    await expect(
      api.db.query(`insert into payday_entries (user_id, id, day, periods, save_share, source, at) values ('${userId}', 'x', '2026-01-01', 1, 1, '2400', 'x')`),
    ).rejects.toThrow(/check constraint/);
    for (const table of MICRO_TABLES) expect(await countRows(api.db, table), table).toBe(0);
  });

  it('checks the bands, the baseline and eligibility', async () => {
    const me = await api.call('GET', `/api/me?today=${DAY}`, { token });
    const baseline = me.body.live.apps.payday.baseline;
    // The check answered W3 with option 1.
    expect(baseline).toEqual({ day: DAY, runwayKey: 'base', runwayOption: 1 });

    const bad: Array<Record<string, unknown>> = [
      payday({ id: 'short' }),
      payday({ periods: 0 }), // a share without periods
      payday({ periods: 1, saveShare: null }), // periods without a share
      payday({ runway: 3 }), // a runway without its baseline
      payday({ runway: 3, baselineDay: '2026-02-01' }), // not a check of this person
      payday({ baselineDay: 'yesterday' }),
      (() => {
        const { runway: _runway, ...rest } = payday();
        return rest;
      })(),
    ];
    for (const body of bad) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([JSON.stringify(body), 400, 'invalid_request']);
    }
    expect((await post(payday({ localDate: '2026-03-20' }))).body.error.code).toBe('clock_skew');
    expect(await countRows(api.db, 'payday_entries')).toBe(0);

    // A student is not offered the payday check.
    const student = await newUser(api);
    await completedCheck(api, student.deviceToken, { role: 'ug4' });
    const refused = await api.call('POST', '/api/payday', { token: student.deviceToken, body: payday() });
    expect([refused.status, refused.body.error.code]).toEqual([403, 'payday_not_eligible']);
    const studentMe = await api.call('GET', `/api/me?today=${DAY}`, { token: student.deviceToken });
    expect(studentMe.body.live.apps.payday).toMatchObject({ enabled: true, available: false, eligible: false, baseline: null });
  });

  it('stores bands once per id', async () => {
    const body = payday({ periods: 3, saveShare: 4, runway: 3, baselineDay: DAY });
    const first = await post(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ stored: true, day: DAY });
    expect(first.body.live.apps.payday).toMatchObject({ recordedToday: true, recordedThisWeek: true, lastDay: DAY, eligible: true });
    const again = await post(body);
    expect([again.status, again.body.stored]).toEqual([200, false]);
    // A correction the same day is a new record with its own id. Both are kept.
    expect((await post(payday({ id: 'payday-entry-000002', periods: 0, saveShare: null }))).status).toBe(201);
    expect(await api.db.query('select * from payday_entries order by id')).toEqual([
      { user_id: userId, id: 'payday-entry-000001', day: DAY, periods: 3, save_share: 4, runway: 3, baseline_day: DAY, source: 'payday', at: NOW },
      { user_id: userId, id: 'payday-entry-000002', day: DAY, periods: 0, save_share: null, runway: null, baseline_day: null, source: 'payday', at: NOW },
    ]);
  });
});

describe('POST /api/weekly-wins and /api/people-nudges: categories and counts', () => {
  let api: TestApi;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    api = await makeApi({ now: NOW });
    const user = await newUser(api);
    token = user.deviceToken;
    userId = user.userId;
    await completedCheck(api, token);
  });

  it('a weekly win is a kind and a few fixed fields, never a title', async () => {
    const post = (body: Record<string, unknown>) => api.call('POST', '/api/weekly-wins', { token, body });
    const bad: Array<Record<string, unknown>> = [
      win({ title: 'Intro to Statistics' }),
      win({ note: 'finished chapter 3' }),
      win({ kind: 'Intro to Statistics' }),
      win({ kind: 'course', hours: 5 }),
      win({ kind: 'course', hours: 12.5 }),
      win({ kind: 'skill', hours: 2 }),
      win({ kind: 'skill', exam: true }),
      win({ kind: 'certificate' }),
      win({ kind: 'certificate', exam: true }),
      win({ kind: 'certificate', exam: 'yes', level: 'entry' }),
      win({ kind: 'certificate', exam: true, level: 'AWS Solutions Architect' }),
      win({ id: 'x' }),
      (() => {
        const { localDate: _localDate, ...rest } = win();
        return rest;
      })(),
    ];
    for (const body of bad) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([JSON.stringify(body), 400, 'invalid_request']);
    }
    expect(await countRows(api.db, 'weekly_wins')).toBe(0);

    expect((await post(win())).status).toBe(201);
    expect((await post(win())).body.stored).toBe(false);
    expect((await post(win({ id: 'weekly-win-0000002', kind: 'course', hours: 3 }))).status).toBe(201);
    expect((await post(win({ id: 'weekly-win-0000003', kind: 'course' }))).status).toBe(201);
    const last = await post(win({ id: 'weekly-win-0000004', kind: 'certificate', exam: true, level: 'advanced' }));
    expect(last.status).toBe(201);
    expect(last.body.live.apps.weeklyWin).toMatchObject({ enabled: true, available: true, recordedToday: true, recordedThisWeek: true, lastDay: DAY });
    expect(await api.db.query('select id, user_id, day, kind, hours, exam, level, source from weekly_wins order by id')).toEqual([
      { id: 'weekly-win-0000001', user_id: userId, day: DAY, kind: 'skill', hours: null, exam: null, level: null, source: 'weekly_win' },
      { id: 'weekly-win-0000002', user_id: userId, day: DAY, kind: 'course', hours: 3, exam: null, level: null, source: 'weekly_win' },
      { id: 'weekly-win-0000003', user_id: userId, day: DAY, kind: 'course', hours: null, exam: null, level: null, source: 'weekly_win' },
      { id: 'weekly-win-0000004', user_id: userId, day: DAY, kind: 'certificate', hours: null, exam: true, level: 'advanced', source: 'weekly_win' },
    ]);
  });

  it('a people nudge is counts by category, never a name, and is capped per day', async () => {
    const post = (body: Record<string, unknown>) => api.call('POST', '/api/people-nudges', { token, body });
    const bad: Array<Record<string, unknown>> = [
      nudge({ names: ['Ana', 'Ben'] }),
      nudge({ reached: ['Ana'] }),
      nudge({ reached: [{ name: 'Ana', category: 'friend' }] }),
      nudge({ reached: 'friend' }),
      nudge({ reached: ['friend', 'friend', 'work', 'other'] }),
      nudge({ planned: 4 }),
      nudge({ planned: -1 }),
      nudge({ planned: 'three' }),
      nudge({ id: null }),
    ];
    for (const body of bad) {
      const res = await post(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([JSON.stringify(body), 400, 'invalid_request']);
    }
    expect(await countRows(api.db, 'people_nudges')).toBe(0);

    const first = await post(nudge({ reached: ['mentor', 'friend', 'friend'] }));
    expect(first.status).toBe(201);
    expect(first.body.live.apps.peopleNudge).toMatchObject({ recordedToday: true, lastDay: DAY });
    expect((await post(nudge())).body.stored).toBe(false);
    expect((await post(nudge({ id: 'people-nudge-00002', planned: 0, reached: [] }))).status).toBe(201);
    expect(
      await api.db.query(
        'select id, planned, reached_family, reached_friend, reached_mentor, reached_work, reached_other, source from people_nudges order by id',
      ),
    ).toEqual([
      { id: 'people-nudge-00001', planned: 3, reached_family: 0, reached_friend: 2, reached_mentor: 1, reached_work: 0, reached_other: 0, source: 'people_nudge' },
      { id: 'people-nudge-00002', planned: 0, reached_family: 0, reached_friend: 0, reached_mentor: 0, reached_work: 0, reached_other: 0, source: 'people_nudge' },
    ]);

    // Ten entries a day at most; an id already stored still answers "not stored" after that.
    for (let i = 3; i <= 10; i += 1) {
      expect((await post(nudge({ id: `people-nudge-${String(i).padStart(5, '0')}` }))).status, String(i)).toBe(201);
    }
    const over = await post(nudge({ id: 'people-nudge-00011' }));
    expect([over.status, over.body.error.code]).toEqual([429, 'entry_limit']);
    expect((await post(nudge())).status).toBe(200);
    expect(await countRows(api.db, 'people_nudges')).toBe(10);
    // The next day is open again.
    api.setNow('2026-03-03T09:00:00.000Z');
    expect((await post(nudge({ id: 'people-nudge-00011', localDate: today(api) }))).status).toBe(201);
    api.setNow(NOW);
  });
});

describe('PostHog: a completion is forwarded without its values', () => {
  it('sends micro_app_completed with the app name for stored entries only', async () => {
    const base = await makeApi({ now: NOW });
    const noted: FunnelEvent[] = [];
    const env = readEnv({ STANDING_ENV: 'local', POSTHOG_KEY: 'phc_test_key', POSTHOG_SALT: 'pepper' });
    const handle = createApi({ db: base.db, env, now: () => new Date(NOW), forward: (events) => void noted.push(...events) });
    const user = await newUser(base);
    await completedCheck(base, user.deviceToken);
    const post = async (path: string, body: unknown) => {
      const res = await handle(
        new Request(`http://test.local${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${user.deviceToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      return res.status;
    };
    expect(await post('/api/daily', daily())).toBe(201);
    expect(await post('/api/daily', daily())).toBe(200); // not stored, not forwarded
    expect(await post('/api/payday', payday({ income: 2400 }))).toBe(400); // refused, not forwarded
    expect(await post('/api/payday', payday())).toBe(201);
    expect(await post('/api/weekly-wins', win({ kind: 'course', hours: 4 }))).toBe(201);
    expect(await post('/api/people-nudges', nudge())).toBe(201);

    expect(noted.map((e) => [e.name, e.app])).toEqual([
      ['micro_app_completed', 'daily_open'],
      ['micro_app_completed', 'payday'],
      ['micro_app_completed', 'weekly_win'],
      ['micro_app_completed', 'people_nudge'],
    ]);
    for (const event of noted) expect(Object.keys(event).sort()).toEqual(['app', 'at', 'name', 'userId']);

    const batches = await buildBatches({ ...env.posthog, environment: 'local' }, noted);
    expect(batches.length).toBe(1);
    for (const sent of batches[0].batch) {
      expect(sent.event).toBe('micro_app_completed');
      expect(sent.distinct_id).not.toContain(user.userId);
      expect(Object.keys(sent.properties).sort()).toEqual(
        ['$geoip_disable', '$ip', '$lib', '$process_person_profile', 'app', 'environment'].sort(),
      );
    }
    // No tap, band, category or count leaves the server.
    const text = JSON.stringify(batches);
    for (const word of ['sleep', 'exercise', 'state', 'saveShare', 'save_share', 'runway', 'periods', 'hours', 'planned', 'reached', 'mentor', 'friend']) {
      expect(text, word).not.toContain(word);
    }
  });
});
