// The demo data script (PROMPT.md section 15): local only, clearly marked as simulated,
// deterministic from a seed, and never possible in production.

import { beforeAll, describe, expect, it } from 'vitest';
import { AREA_IDS, RETEST_WINDOW_DAYS, ROLE_IDS, nextQuestion, paydayEligible } from '@/engine';
import type { Db } from '@/server/db';
import { readEnv } from '@/server/env';
import { liveOf, loadPerson } from '@/server/live';
import { createApi } from '@/server/router';
import { backgroundOf, excludedAreasOf, loadEvents, stepsOf, type SessionRow } from '@/server/sessions';
import { SeedRefused, assertSeedAllowed, formatSeedSummary, makeRng, removeDemo, seedDemo, type SeedSummary } from '../../../scripts/lib/seed';
import { bank } from '../server/helpers/api';
import { freshDb } from '../server/helpers/db';

const NOW = new Date('2026-06-15T10:20:30.000Z');
const PEOPLE = 132;

const count = async (db: Db, sql: string): Promise<number> => (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`))[0].n;

/** Every row of every table, in a fixed order, as one string. */
async function dump(db: Db): Promise<string> {
  const parts: string[] = [];
  for (const [table, order] of [
    ['users', 'id'],
    ['consents', 'id'],
    ['sessions', 'id'],
    ['question_events', 'session_id, seq, action'],
    ['results', 'session_id, algo_version'],
    ['report_events', 'user_id, id'],
    ['visits', 'user_id, day'],
    ['daily_entries', 'user_id, day'],
    ['payday_entries', 'user_id, id'],
    ['weekly_wins', 'user_id, id'],
    ['people_nudges', 'user_id, id'],
  ]) {
    parts.push(JSON.stringify(await db.query(`select * from ${table} order by ${order}`)));
  }
  return parts.join('\n');
}

describe('the guard', () => {
  const env = (vars: Record<string, string>) => readEnv({ STANDING_ENV: 'local', ...vars });

  it('refuses production, with or without a database URL, whatever the flags', () => {
    for (const vars of [
      { STANDING_ENV: 'production' },
      { STANDING_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost:5432/standing' },
      { VERCEL_ENV: 'production', STANDING_ENV: '' },
      { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example.com/standing', STANDING_ENV: '' },
    ]) {
      expect(() => assertSeedAllowed(readEnv(vars), { forceLocalUrl: true }), JSON.stringify(vars)).toThrow(SeedRefused);
    }
  });

  it('refuses a database URL unless --force-local-url is given and the URL is on this machine', () => {
    const remote = env({ DATABASE_URL: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres' });
    const local = env({ DATABASE_URL: 'postgres://u:p@localhost:5432/standing' });
    expect(() => assertSeedAllowed(remote, { forceLocalUrl: false })).toThrow(/DATABASE_URL is set/);
    expect(() => assertSeedAllowed(local, { forceLocalUrl: false })).toThrow(/DATABASE_URL is set/);
    expect(() => assertSeedAllowed(remote, { forceLocalUrl: true })).toThrow(/does not point at localhost/);
    expect(() => assertSeedAllowed(local, { forceLocalUrl: true })).not.toThrow();
    expect(() => assertSeedAllowed(env({ DATABASE_URL: 'postgres://u:p@127.0.0.1/standing' }), { forceLocalUrl: true })).not.toThrow();
    // The local embedded database needs no flag.
    expect(() => assertSeedAllowed(env({}), { forceLocalUrl: false })).not.toThrow();
  });
});

describe('the random numbers', () => {
  it('are the same for the same seed and differ for another', () => {
    const draw = (seed: number) => Array.from({ length: 5 }, makeRng(seed).next);
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    for (const x of draw(7)) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('seeding', () => {
  let db: Db;
  let summary: SeedSummary;

  beforeAll(async () => {
    db = await freshDb();
    summary = await seedDemo(db, { seed: 5, people: PEOPLE, now: NOW });
  }, 120_000);

  it('makes the people it reports, every one flagged as simulated and none able to sign in', async () => {
    expect(summary.people).toBe(PEOPLE);
    expect(await count(db, 'users')).toBe(PEOPLE);
    expect(await count(db, 'users where not is_demo')).toBe(0);
    expect(await count(db, 'device_tokens')).toBe(0);
    // No recovery code hashes to a value of this form.
    expect(await count(db, "users where recovery_hash not like 'demo:%'")).toBe(0);
    expect(await count(db, "users where id not like 'demo-5-%'")).toBe(0);
  });

  it('covers all 11 roles and every age band', async () => {
    expect(Object.keys(summary.byRole).sort()).toEqual([...ROLE_IDS].sort());
    for (const role of ROLE_IDS) expect(summary.byRole[role], role).toBe(PEOPLE / ROLE_IDS.length);
    expect(summary.byAge.length).toBe(bank.ages.length);
    for (const n of summary.byAge) expect(n).toBe(PEOPLE / bank.ages.length);
    const combos = await count(db, '(select distinct role, age from sessions) x');
    expect(combos).toBe(ROLE_IDS.length * bank.ages.length);
  });

  it('the counts it prints are the rows in the database', async () => {
    expect(summary.checksStarted).toBe(await count(db, 'sessions'));
    expect(summary.checksCompleted).toBe(await count(db, 'sessions where completed_at is not null'));
    expect(summary.checksLeftOpen).toBe(await count(db, 'sessions where completed_at is null'));
    expect(summary.results).toBe(await count(db, 'results'));
    expect(summary.results).toBe(summary.checksCompleted);
    expect(summary.questionEvents).toBe(await count(db, 'question_events'));
    expect(summary.skips).toBe(await count(db, "question_events where action = 'skip'"));
    expect(summary.notApplicable).toBe(await count(db, "question_events where action = 'na'"));
    expect(summary.reportEvents).toBe(await count(db, 'report_events'));
    expect(summary.visits).toBe(await count(db, 'visits'));
    expect(summary.secondChecks).toBe(await count(db, "sessions where id like '%-s2'"));
    // Varied: some of everything.
    for (const key of ['checksLeftOpen', 'secondChecks', 'skips', 'notApplicable', 'reportEvents'] as const) {
      expect(summary[key], key).toBeGreaterThan(0);
    }
    expect(summary.withHealthConsent).toBeGreaterThan(0);
    expect(summary.withHealthConsent).toBeLessThan(PEOPLE);
    const text = formatSeedSummary(summary, bank.ages.map((a) => a.en));
    expect(text).toContain('SIMULATED DATA, seed 5.');
    expect(text).toContain(`People: ${PEOPLE}`);
  });

  it('every check is a valid path through the bank and every completed one is finished', async () => {
    const sessions = await db.query<SessionRow>('select * from sessions order by id');
    for (const session of sessions) {
      const events = await loadEvents(db, session.id);
      const steps = stepsOf(events);
      // Replaying the answers gives the same questions in the same order.
      const replay: typeof steps = [];
      for (const step of steps) {
        const q = nextQuestion(bank, backgroundOf(session), replay, { excludedAreas: excludedAreasOf(session) });
        expect([q?.id, q?.key], session.id).toEqual([step.id, step.key]);
        replay.push(step);
      }
      const next = nextQuestion(bank, backgroundOf(session), steps, { excludedAreas: excludedAreasOf(session) });
      if (session.completed_at) expect(next, session.id).toBeNull();
      else expect(next, session.id).not.toBeNull();
    }
    // Times are plausible: positive, some very fast, none absurd.
    const times = await db.query<{ lo: number; hi: number; fast: number }>(
      `select min(seconds)::float8 as lo, max(seconds)::float8 as hi, (count(*) filter (where seconds < 1))::int as fast
       from question_events where action = 'select'`,
    );
    expect(times[0].lo).toBeGreaterThan(0);
    expect(times[0].hi).toBeLessThan(600);
    expect(times[0].fast).toBeGreaterThan(0);
  });

  it('second checks come 10 to 21 days after the first, and everything lies in the 45 days before today', async () => {
    const gaps = await db.query<{ gap: number }>(
      `select (substr(b.completed_at, 1, 10)::date - substr(a.completed_at, 1, 10)::date)::int as gap
       from sessions a join sessions b on b.user_id = a.user_id and a.id like '%-s1' and b.id like '%-s2'`,
    );
    expect(gaps.length).toBe(summary.secondChecks);
    for (const { gap } of gaps) {
      expect(gap).toBeGreaterThanOrEqual(RETEST_WINDOW_DAYS.min);
      expect(gap).toBeLessThanOrEqual(RETEST_WINDOW_DAYS.max);
    }
    expect([summary.firstDay, summary.lastDay]).toEqual(['2026-05-01', '2026-06-14']);
    const span = await db.query<{ lo: string; hi: string; vlo: string; vhi: string; rhi: string }>(
      `select (select min(created_at) from sessions) as lo, (select max(at) from question_events) as hi,
         (select min(day) from visits) as vlo, (select max(day) from visits) as vhi, (select max(at) from report_events) as rhi`,
    );
    expect(span[0].lo >= '2026-05-01').toBe(true);
    expect(span[0].hi < NOW.toISOString()).toBe(true);
    expect(span[0].rhi < NOW.toISOString()).toBe(true);
    expect(span[0].vlo >= '2026-05-01').toBe(true);
    expect(span[0].vhi <= '2026-06-14').toBe(true);
    expect(await count(db, '(select distinct day from visits) x')).toBeGreaterThan(30);
  });

  it('part of the people use the micro apps, with gaps: some stop, some come back', async () => {
    // The counts it prints are the rows in the database.
    expect(summary.dailyEntries).toBe(await count(db, 'daily_entries'));
    expect(summary.paydayEntries).toBe(await count(db, 'payday_entries'));
    expect(summary.weeklyWins).toBe(await count(db, 'weekly_wins'));
    expect(summary.peopleNudges).toBe(await count(db, 'people_nudges'));
    for (const key of ['dailyEntries', 'paydayEntries', 'weeklyWins', 'peopleNudges'] as const) {
      expect(summary[key], key).toBeGreaterThan(0);
    }
    const users = await count(
      db,
      `(select user_id from daily_entries union select user_id from payday_entries
        union select user_id from weekly_wins union select user_id from people_nudges) x`,
    );
    expect(summary.microAppPeople).toBe(users);
    // Some use them, not everyone, and only people with a completed check.
    expect(users).toBeGreaterThan(PEOPLE * 0.25);
    expect(users).toBeLessThan(PEOPLE * 0.75);
    expect(await count(db, `(select distinct e.user_id from daily_entries e where not exists (
      select 1 from sessions s where s.user_id = e.user_id and s.completed_at is not null)) x`)).toBe(0);
    expect(formatSeedSummary(summary, bank.ages.map((a) => a.en))).toContain(`payday checks ${summary.paydayEntries} (bands only)`);

    // The rules of the product hold: no daily open without the health consent, payday only for
    // people it is offered to, nothing before the first check, nothing in the future.
    expect(await count(db, 'daily_entries e join users u on u.id = e.user_id where u.health_consent_version is null')).toBe(0);
    const paid = await db.query<SessionRow>(
      `select distinct on (s.user_id) s.* from sessions s where s.user_id in (select user_id from payday_entries) order by s.user_id, s.created_at`,
    );
    expect(paid.length).toBeGreaterThan(0);
    for (const session of paid) expect(paydayEligible(bank, backgroundOf(session)), session.user_id).toBe(true);
    for (const [table, column] of [['daily_entries', 'day'], ['daily_entries', 'logged_on'], ['payday_entries', 'day'], ['weekly_wins', 'day'], ['people_nudges', 'day']]) {
      expect(await count(db, `${table} e where e.${column} > '2026-06-14'`), table).toBe(0);
      expect(
        await count(db, `${table} e where e.${column} < (select min(s.local_day) from sessions s where s.user_id = e.user_id)`),
        table,
      ).toBe(0);
    }
    // Yesterday filled in today happens, and never further back than a day.
    expect(await count(db, 'daily_entries where logged_on > day')).toBeGreaterThan(0);
    expect(await count(db, "daily_entries where logged_on::date - day::date > 1")).toBe(0);
    // Every visit day of a micro-app entry is also a visit: the app was opened.
    expect(await count(db, 'daily_entries e where not exists (select 1 from visits v where v.user_id = e.user_id and v.day = e.logged_on)')).toBe(0);

    // Gaps between the days a person recorded a daily entry.
    const gaps = await db.query<{ user_id: string; longest: number; days: number; last: string; first: string }>(
      `select user_id, max(gap)::int as longest, count(*)::int as days, max(logged_on) as last, min(logged_on) as first
       from (select user_id, logged_on, (logged_on::date - lag(logged_on::date) over (partition by user_id order by logged_on))::int as gap
             from (select distinct user_id, logged_on from daily_entries) d) g
       group by user_id`,
    );
    // Came back: away for more than a week and then active again.
    expect(gaps.filter((g) => g.longest >= 8).length).toBeGreaterThan(0);
    // Stopped: started at least three weeks before the end and nothing in the last ten days.
    expect(gaps.filter((g) => g.first <= '2026-05-24' && g.last <= '2026-06-04').length).toBeGreaterThan(0);
    // Kept going: active in the last three days after at least two weeks.
    expect(gaps.filter((g) => g.first <= '2026-05-31' && g.last >= '2026-06-12' && g.days >= 10).length).toBeGreaterThan(0);
  });

  it('the engine draws a live series for every simulated person from the seeded records', async () => {
    const flags = { dailyOpen: true, payday: true, weeklyWin: true, peopleNudge: true };
    const people = await db.query<{ id: string; health_consent_version: string | null }>(
      `select u.id, u.health_consent_version from users u
       where exists (select 1 from sessions s where s.user_id = u.id and s.completed_at is not null) order by u.id`,
    );
    let moved = 0;
    let halted = 0;
    for (const person of people) {
      const live = liveOf(await loadPerson(db, person.id, '2026-06-15', person.health_consent_version !== null), person, flags, '2026-06-15');
      expect(live, person.id).not.toBeNull();
      if (!live) continue;
      expect(live.today).toBe('2026-06-15');
      expect(live.series.overall.length).toBe(live.series.length);
      expect(live.series.length).toBeLessThanOrEqual(46);
      // No sector ever moves more than the daily limit except on the day of a full check.
      const checkDays = new Set(live.markers.filter((m) => m.kind === 'full_check').map((m) => m.day));
      const start = Date.parse(`${live.series.start}T00:00:00.000Z`);
      for (const area of AREA_IDS) {
        const series = live.series.sectors[area];
        for (let i = 1; i < series.length; i += 1) {
          const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
          const [a, b] = [series[i - 1], series[i]];
          if (a === null || b === null || checkDays.has(day)) continue;
          expect(Math.abs(b - a), `${person.id} ${area} ${day}`).toBeLessThanOrEqual(live.moveLimit + 0.011);
        }
      }
      if (new Set(live.series.overall).size > live.markers.length) moved += 1;
      if (live.halts.length > 0) halted += 1;
    }
    // The charts have something to show: prices that move between checks, and halted stretches.
    expect(moved).toBeGreaterThan(10);
    expect(halted).toBeGreaterThan(0);
  });

  it('the dashboard marks every table as including simulated data', async () => {
    const env = readEnv({ STANDING_ENV: 'local', ADMIN_PASSPHRASE: 'pass' });
    const handle = createApi({ db, env, now: () => NOW });
    const get = async (path: string) =>
      handle(new Request(`http://test.local${path}`, { headers: { authorization: 'Bearer pass' } }));
    const overview = (await (await get('/api/team/overview')).json()) as any;
    expect(overview.demoPeople).toBe(PEOPLE);
    expect(overview.demoChecks).toBe(summary.checksStarted);
    expect(overview.totals.sessions).toMatchObject({ count: summary.checksCompleted, of: summary.checksStarted });
    expect(overview.byRole.length).toBe(ROLE_IDS.length);
    expect(overview.retest.pairs).toBeGreaterThan(0);
    for (const table of ['items', 'prices', 'norms', 'returns', 'report', 'daily']) {
      const body = (await (await get(`/api/team/${table}`)).json()) as any;
      expect(body.demoPeople, table).toBe(PEOPLE);
      expect(body.rows.length, table).toBeGreaterThan(0);
      expect((await get(`/api/team/${table}?format=csv`)).headers.get('x-standing-demo-people'), table).toBe(String(PEOPLE));
    }
    // The stage 2 tables have something to show.
    const daily = (await (await get('/api/team/daily')).json()) as any;
    expect(daily.rows.length).toBeGreaterThan(30);
    expect(daily.rows[0].dailyOpen.count).toBeGreaterThan(0);
    expect(daily.rows[0].dailyOpen.count).toBeLessThanOrEqual(daily.rows[0].dailyOpen.of);
    const apps = (await (await get('/api/team/apps')).json()) as any;
    expect(apps.demoPeople).toBe(PEOPLE);
    expect(apps.weeks.length).toBeGreaterThanOrEqual(6);
    for (const row of apps.summary) {
      expect(row.participated.of, row.app).toBeGreaterThan(0);
      expect(row.participated.count, row.app).toBeGreaterThan(0);
      expect(row.participated.count, row.app).toBeLessThanOrEqual(row.participated.of);
    }
    const gates = (await (await get('/api/team/gates')).json()) as any;
    expect(gates.demoPeople).toBe(PEOPLE);
    for (const gate of gates.gates) expect(gate.value, gate.id).not.toBeNull();
    const returns = (await (await get('/api/team/returns')).json()) as any;
    const all = returns.rows[0].returns;
    // People come back less as the days go by, and day 30 has people behind it.
    expect(all[0].rate).toBeGreaterThan(all[2].rate);
    expect(all[2].of).toBeGreaterThan(0);
    const tests = (await (await get('/api/team/tests')).json()) as any;
    expect(tests.demoPeople).toBe(summary.checksCompleted - summary.secondChecks);
    expect(tests.checks).toBe(summary.checksCompleted);
    expect(tests.results.range.verdict).not.toBe('insufficient_data');
  });

  it('is deterministic: the same seed and day give the same rows, another seed gives others', async () => {
    const again = await freshDb();
    // Another time on the same day changes nothing.
    const second = await seedDemo(again, { seed: 5, people: PEOPLE, now: new Date('2026-06-15T23:59:00.000Z') });
    expect(second).toEqual(summary);
    expect(await dump(again)).toBe(await dump(db));

    const other = await freshDb();
    await seedDemo(other, { seed: 6, people: 22, now: NOW });
    const a = await other.query('select role, age, extra from sessions order by id');
    const b = await db.query("select role, age, extra from sessions where id like '%-s1' order by id limit 22");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  }, 120_000);

  it('refuses a seed that is already there, and removeDemo takes simulated people only', async () => {
    await expect(seedDemo(db, { seed: 5, people: 3, now: NOW })).rejects.toThrow(/seed 5 is already in this database/);
    await expect(seedDemo(db, { seed: 9, people: 0, now: NOW })).rejects.toThrow(/people must be/);

    await db.query(
      `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version, general_consent_at, lang)
       values ('real-person', '2026-06-01T00:00:00.000Z', 'hash', '2026-06-01T00:00:00.000Z', 'general-1', '2026-06-01T00:00:00.000Z', 'en')`,
    );
    expect(await removeDemo(db)).toBe(PEOPLE);
    expect(await db.query('select id from users')).toEqual([{ id: 'real-person' }]);
    for (const table of ['sessions', 'question_events', 'results', 'report_events', 'visits', 'consents', 'daily_entries', 'payday_entries', 'weekly_wins', 'people_nudges']) {
      expect(await count(db, table), table).toBe(0);
    }
  });
});

describe('the demo viewer', () => {
  it('is one more simulated person with two checks, steady daily records and a recovery code that works', async () => {
    const db = await freshDb();
    const summary = await seedDemo(db, { seed: 3, people: 11, now: NOW, viewer: true });
    const viewer = summary.viewer;
    expect(viewer).not.toBeNull();
    if (!viewer) return;
    // Not counted among the people, but flagged as simulated like them.
    expect(summary.people).toBe(11);
    expect(await count(db, 'users')).toBe(12);
    expect(await count(db, 'users where not is_demo')).toBe(0);
    expect(viewer.checks).toBe(2);
    expect(await count(db, `sessions where user_id = '${viewer.id}' and completed_at is not null`)).toBe(2);
    // Steady use over the 45 days: most days have a daily entry.
    expect(viewer.dailyEntries).toBeGreaterThan(30);
    expect(viewer.weeklyWins + viewer.peopleNudges).toBeGreaterThan(0);

    // The printed code connects a device, and the record says it is simulated.
    const env = readEnv({ STANDING_ENV: 'local' });
    const handle = createApi({ db, env, now: () => NOW });
    const restored = await handle(
      new Request('http://test.local/api/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recoveryCode: viewer.recoveryCode }),
      }),
    );
    expect(restored.status).toBe(200);
    const { deviceToken, userId } = (await restored.json()) as { deviceToken: string; userId: string };
    expect(userId).toBe(viewer.id);
    const me = (await (
      await handle(new Request('http://test.local/api/me?today=2026-06-15', { headers: { authorization: `Bearer ${deviceToken}` } }))
    ).json()) as any;
    expect(me.user.simulated).toBe(true);
    expect(me.user.ticker).toBe('DEMO');
    expect(me.history.length).toBe(2);
    expect(me.live.series.length).toBeGreaterThan(40);

    const text = formatSeedSummary(summary, bank.ages.map((a) => a.en));
    expect(text).toContain(viewer.recoveryCode);
    expect(text).toContain('/settings?restore=1');
    // removeDemo takes the viewer as well.
    expect(await removeDemo(db)).toBe(12);
  }, 120_000);

  it('a real person is never marked simulated', async () => {
    const db = await freshDb();
    const env = readEnv({ STANDING_ENV: 'local' });
    const handle = createApi({ db, env, now: () => NOW });
    const made = await handle(
      new Request('http://test.local/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang: 'en', consent: { general: 'general-1', health: null } }),
      }),
    );
    const body = (await made.json()) as any;
    expect(made.status, JSON.stringify(body)).toBeLessThan(300);
    const me = (await (
      await handle(new Request('http://test.local/api/me', { headers: { authorization: `Bearer ${body.deviceToken}` } }))
    ).json()) as any;
    expect(me.user.simulated).toBe(false);
  });
});
