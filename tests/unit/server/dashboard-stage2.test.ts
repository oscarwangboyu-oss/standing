// The stage 2 numbers of the team dashboard, checked against one small dataset built by hand.
// Every row is inserted directly, so the right answer is known in advance and written out here.
// The clock stands at 2026-03-31 12:00 UTC, a Tuesday. Weeks start on Monday: Feb 16, Feb 23,
// Mar 2, 9, 16, 23, 30.
//
// PEOPLE (all with the health consent unless noted)
//   Cohort A, first check completed on 2026-02-20: p1, p2, p3, p4. Full-time employees living on
//     their own earnings, so the payday check is offered to them.
//   Cohort B, first check completed on 2026-03-20: p5 (employee) and p6 (a student, no health
//     consent: no daily open, no payday check).
//   p7 started a check on 2026-03-20 and never finished it. p7 is flagged as simulated.
//
// WHAT THEY DID AFTERWARDS
//   p1  visits on 02-21 and 02-27; a payday check on 03-22; daily entries on 03-29 and 03-30;
//       a visit on 03-30.
//   p2  a daily entry for 02-20, filled in on 02-21. No visit.
//   p3  a weekly win on 02-27; a visit on 03-30.
//   p4  nothing.
//   p5  a visit on 03-21; a people nudge on 03-27; a daily entry and a weekly win on 03-30.
//   p6  a visit on 03-30.
//   p7  a visit on 03-30 (no completed check: never counted as active).
//
// RETURN RATES (day N after the first check; a visit or any entry that day counts)
//   Cohort A  day 1 = 02-21: p1, p2 -> 2 of 4.  day 7 = 02-27: p1, p3 -> 2 of 4.
//             day 30 = 03-22: p1 -> 1 of 4.
//   Cohort B  day 1 = 03-21: p5 -> 1 of 2.  day 7 = 03-27: p5 -> 1 of 2.  day 30: not over yet.
//   All       day 1: 3 of 6.  day 7: 3 of 6 (gate 25%: met).  day 30: 1 of 4 (gate 12%: met).
//
// DAILY OPEN, DAY BY DAY (active people; of those with the health consent, who recorded it)
//   02-21  active p1, p2: 2       daily open 1 of 2 (p2)
//   02-27  active p1, p3: 2       0 of 2
//   03-21  active p5: 1           0 of 1
//   03-22  active p1: 1           0 of 1
//   03-27  active p5: 1           0 of 1
//   03-29  active p1: 1           1 of 1
//   03-30  active p1, p3, p5, p6: 4   2 of 3 (p1, p5; p6 has no health consent)
//   All    12 person-days         4 of 11
//
// DAILY OPEN, WEEK BY WEEK (the same person-days added up by calendar week; the weeks start on
// Monday 2026-01-26, the week of 2026-01-31, the first of the last 60 days)
//   02-16  02-21                  people p1, p2      2 person-days   1 of 2
//   02-23  02-27                  people p1, p3      2               0 of 2
//   03-16  03-21, 03-22           people p5, p1      2               0 of 2
//   03-23  03-27, 03-29           people p5, p1      2               1 of 2 (p1 on 03-29)
//   03-30  03-30                  people p1, p3, p5, p6   4          2 of 3
//   All                           people p1, p2, p3, p5, p6: 5   12   4 of 11
//
// APPS, RECENT WINDOW ENDING TODAY
//   daily open, 7 days (03-25 to 03-31): active p1, p3, p5, p6 = 4; offered 3; used p1, p5 -> 2 of 3; 3 entries.
//   payday, 30 days (03-02 to 03-31): active 4; offered p1, p3, p5 = 3; used p1 -> 1 of 3 (gate 50%: not met); 1 entry.
//   weekly win, 7 days: active 4; offered 4; used p5 -> 1 of 4; 1 entry.
//   people nudge, 7 days: active 4; offered 4; used p5 -> 1 of 4; 1 entry.
//
// WEEKLY APPS, WEEK BY WEEK (people active that week; who logged a win; who logged a nudge)
//   02-16  p1, p2: 2          win 0   nudge 0
//   02-23  p1, p3: 2          win 1 (p3)   nudge 0
//   03-16  p1, p5: 2          win 0   nudge 0
//   03-23  p1, p5: 2          win 0   nudge 1 (p5)
//   03-30  p1, p3, p5, p6: 4  win 1 (p5)   nudge 0

import { beforeAll, describe, expect, it } from 'vitest';
import { EVALUATION, GO_CRITERIA, SEVEN_TESTS, paydayEligible } from '@/engine';
import type { Db } from '@/server/db';
import { backgroundFor, bank, makeApi, TEAM_PASSPHRASE, type TestApi } from './helpers/api';

const NOW = '2026-03-31T12:00:00.000Z';

async function addPerson(
  db: Db,
  p: { id: string; role: 'emp' | 'ug4'; day0: string; completed?: boolean; health?: boolean; demo?: boolean; overall?: number },
): Promise<void> {
  const health = p.health ?? true;
  await db.query(
    `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version,
       general_consent_at, health_consent_version, health_consent_at, lang, is_demo)
     values ($1, $2, $3, $2, 'general-1', $2, $4, $5, 'en', $6)`,
    [p.id, `${p.day0}T10:00:00.000Z`, `hash-of-${p.id}`, health ? 'health-1' : null, health ? `${p.day0}T10:00:00.000Z` : null, p.demo ?? false],
  );
  const completed = p.completed ?? true;
  await db.query(
    `insert into sessions (id, user_id, created_at, completed_at, local_day, age, role, extra, lang, bank_version, health_consent)
     values ($1, $2, $3, $4, $5, 2, $6, $7, 'en', '2.1', $8)`,
    [`${p.id}-s1`, p.id, `${p.day0}T10:00:00.000Z`, completed ? `${p.day0}T10:06:00.000Z` : null, p.day0, p.role, JSON.stringify(backgroundFor(p.role).extra), health],
  );
  if (completed) {
    await db.query(
      `insert into results (session_id, algo_version, norm_version, bank_version, user_id, computed_at, overall, price_c, grade, result)
       values ($1, 1, 'provisional-1', '2.1', $2, $3, $4, $4, 'A', '{}')`,
      [`${p.id}-s1`, p.id, `${p.day0}T10:06:00.000Z`, p.overall ?? 100],
    );
  }
}

const at = (day: string) => `${day}T15:00:00.000Z`;
const visit = (db: Db, user: string, day: string) => db.query('insert into visits (user_id, day, first_at) values ($1, $2, $3)', [user, day, at(day)]);
const dailyEntry = (db: Db, user: string, day: string, loggedOn = day) =>
  db.query('insert into daily_entries (user_id, day, logged_on, sleep, exercise, state, at) values ($1, $2, $3, 3, 2, 3, $4)', [user, day, loggedOn, at(loggedOn)]);
const paydayEntry = (db: Db, user: string, day: string) =>
  db.query(`insert into payday_entries (user_id, id, day, periods, save_share, at) values ($1, $2, $3, 1, 2, $4)`, [user, `${user}-pay-${day}`, day, at(day)]);
const weeklyWin = (db: Db, user: string, day: string) =>
  db.query(`insert into weekly_wins (user_id, id, day, kind, at) values ($1, $2, $3, 'skill', $4)`, [user, `${user}-win-${day}`, day, at(day)]);
const peopleNudge = (db: Db, user: string, day: string) =>
  db.query(`insert into people_nudges (user_id, id, day, planned, reached_friend, at) values ($1, $2, $3, 3, 2, $4)`, [user, `${user}-nudge-${day}`, day, at(day)]);

describe('the stage 2 dashboard on a constructed dataset', () => {
  let api: TestApi;
  const team = (path: string) => api.call('GET', path, { token: TEAM_PASSPHRASE });

  beforeAll(async () => {
    api = await makeApi({ now: NOW });
    const db = api.db;
    for (const id of ['p1', 'p2', 'p3', 'p4']) await addPerson(db, { id, role: 'emp', day0: '2026-02-20', overall: 90 + Number(id[1]) * 5 });
    await addPerson(db, { id: 'p5', role: 'emp', day0: '2026-03-20', overall: 120 });
    await addPerson(db, { id: 'p6', role: 'ug4', day0: '2026-03-20', health: false, overall: 80 });
    await addPerson(db, { id: 'p7', role: 'emp', day0: '2026-03-20', completed: false, demo: true });

    await visit(db, 'p1', '2026-02-21');
    await visit(db, 'p1', '2026-02-27');
    await paydayEntry(db, 'p1', '2026-03-22');
    await dailyEntry(db, 'p1', '2026-03-29');
    await dailyEntry(db, 'p1', '2026-03-30');
    await visit(db, 'p1', '2026-03-30');
    await dailyEntry(db, 'p2', '2026-02-20', '2026-02-21');
    await weeklyWin(db, 'p3', '2026-02-27');
    await visit(db, 'p3', '2026-03-30');
    await visit(db, 'p5', '2026-03-21');
    await peopleNudge(db, 'p5', '2026-03-27');
    await dailyEntry(db, 'p5', '2026-03-30');
    await weeklyWin(db, 'p5', '2026-03-30');
    await visit(db, 'p6', '2026-03-30');
    await visit(db, 'p7', '2026-03-30');
  });

  it('the dataset is what the comments say about payday eligibility', () => {
    expect(paydayEligible(bank, backgroundFor('emp'))).toBe(true);
    expect(paydayEligible(bank, backgroundFor('ug4'))).toBe(false);
  });

  it('return rates on day 1, 7 and 30 by first-check cohort count a visit or any entry', async () => {
    const res = await team('/api/team/returns');
    expect(res.status).toBe(200);
    expect(res.body.returnDays).toEqual([1, 7, 30]);
    const row = (firstDay: string) => res.body.rows.find((r: any) => r.firstDay === firstDay);
    expect(row('2026-02-20')).toEqual({
      firstDay: '2026-02-20',
      people: 4,
      returns: [
        { day: 1, count: 2, of: 4, rate: 0.5 },
        { day: 7, count: 2, of: 4, rate: 0.5 },
        { day: 30, count: 1, of: 4, rate: 0.25 },
      ],
    });
    expect(row('2026-03-20')).toEqual({
      firstDay: '2026-03-20',
      people: 2,
      returns: [
        { day: 1, count: 1, of: 2, rate: 0.5 },
        { day: 7, count: 1, of: 2, rate: 0.5 },
        { day: 30, count: 0, of: 0, rate: null },
      ],
    });
    expect(row('all')).toEqual({
      firstDay: 'all',
      people: 6,
      returns: [
        { day: 1, count: 3, of: 6, rate: 0.5 },
        { day: 7, count: 3, of: 6, rate: 0.5 },
        { day: 30, count: 1, of: 4, rate: 0.25 },
      ],
    });
    expect(res.body.rows.length).toBe(3);
    // One first-check day per week here: 02-20 is in the week of 02-16, 03-20 in that of 03-16.
    expect(res.body.weeks).toEqual([
      { weekStart: 'all', people: 6, returns: row('all').returns },
      { weekStart: '2026-02-16', people: 4, returns: row('2026-02-20').returns },
      { weekStart: '2026-03-16', people: 2, returns: row('2026-03-20').returns },
    ]);
  });

  it('share of active people who did the daily open, each day', async () => {
    const res = await team('/api/team/daily');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ generatedAt: NOW, demoPeople: 1, days: 60 });
    expect(res.body.rows).toEqual([
      { day: 'all', active: 12, dailyOpen: { count: 4, of: 11, rate: 4 / 11 } },
      { day: '2026-02-21', active: 2, dailyOpen: { count: 1, of: 2, rate: 0.5 } },
      { day: '2026-02-27', active: 2, dailyOpen: { count: 0, of: 2, rate: 0 } },
      { day: '2026-03-21', active: 1, dailyOpen: { count: 0, of: 1, rate: 0 } },
      { day: '2026-03-22', active: 1, dailyOpen: { count: 0, of: 1, rate: 0 } },
      { day: '2026-03-27', active: 1, dailyOpen: { count: 0, of: 1, rate: 0 } },
      { day: '2026-03-29', active: 1, dailyOpen: { count: 1, of: 1, rate: 1 } },
      { day: '2026-03-30', active: 4, dailyOpen: { count: 2, of: 3, rate: 2 / 3 } },
    ]);
    const csv = await team('/api/team/daily?format=csv');
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('x-standing-demo-people')).toBe('1');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe('day,active,daily_open_offered,daily_open_done,daily_open_rate');
    expect(lines[1]).toBe(`all,12,11,4,${4 / 11}`);
    expect(lines[lines.length - 1]).toBe(`2026-03-30,4,3,2,${2 / 3}`);
    expect(lines.length).toBe(9);
  });

  it('the daily open week by week, in person-days, from the Monday of the first of the 60 days', async () => {
    const res = await team('/api/team/daily');
    expect(res.body.weeksFrom).toBe('2026-01-26');
    expect(res.body.weeks).toEqual([
      { weekStart: 'all', people: 5, active: 12, dailyOpen: { count: 4, of: 11, rate: 4 / 11 } },
      { weekStart: '2026-02-16', people: 2, active: 2, dailyOpen: { count: 1, of: 2, rate: 0.5 } },
      { weekStart: '2026-02-23', people: 2, active: 2, dailyOpen: { count: 0, of: 2, rate: 0 } },
      { weekStart: '2026-03-16', people: 2, active: 2, dailyOpen: { count: 0, of: 2, rate: 0 } },
      { weekStart: '2026-03-23', people: 2, active: 2, dailyOpen: { count: 1, of: 2, rate: 0.5 } },
      { weekStart: '2026-03-30', people: 4, active: 4, dailyOpen: { count: 2, of: 3, rate: 2 / 3 } },
    ]);
    // The weeks add up to the same person-days as the days.
    expect(res.body.weeks[0].dailyOpen).toEqual(res.body.rows[0].dailyOpen);
  });

  it('share of active people each app is offered to who used it, and the weekly apps week by week', async () => {
    const res = await team('/api/team/apps');
    expect(res.status).toBe(200);
    expect(res.body.demoPeople).toBe(1);
    expect(res.body.summary).toEqual([
      { app: 'daily_open', enabled: true, windowDays: 7, active: 4, participated: { count: 2, of: 3, rate: 2 / 3 }, entries: 3 },
      { app: 'payday', enabled: true, windowDays: 30, active: 4, participated: { count: 1, of: 3, rate: 1 / 3 }, entries: 1 },
      { app: 'weekly_win', enabled: true, windowDays: 7, active: 4, participated: { count: 1, of: 4, rate: 0.25 }, entries: 1 },
      { app: 'people_nudge', enabled: true, windowDays: 7, active: 4, participated: { count: 1, of: 4, rate: 0.25 }, entries: 1 },
    ]);
    expect(res.body.weeks).toEqual([
      { weekStart: '2026-02-16', active: 2, weeklyWin: { count: 0, of: 2, rate: 0 }, peopleNudge: { count: 0, of: 2, rate: 0 } },
      { weekStart: '2026-02-23', active: 2, weeklyWin: { count: 1, of: 2, rate: 0.5 }, peopleNudge: { count: 0, of: 2, rate: 0 } },
      { weekStart: '2026-03-16', active: 2, weeklyWin: { count: 0, of: 2, rate: 0 }, peopleNudge: { count: 0, of: 2, rate: 0 } },
      { weekStart: '2026-03-23', active: 2, weeklyWin: { count: 0, of: 2, rate: 0 }, peopleNudge: { count: 1, of: 2, rate: 0.5 } },
      { weekStart: '2026-03-30', active: 4, weeklyWin: { count: 1, of: 4, rate: 0.25 }, peopleNudge: { count: 0, of: 4, rate: 0 } },
    ]);

    const weeks = (await team('/api/team/apps?format=csv')).text.trim().split('\r\n');
    expect(weeks[0]).toBe('week_start,active,weekly_win_people,weekly_win_rate,people_nudge_people,people_nudge_rate');
    expect(weeks[2]).toBe('2026-02-23,2,1,0.5,0,0');
    expect(weeks.length).toBe(6);
    const summary = (await team('/api/team/apps?format=csv&table=summary')).text.trim().split('\r\n');
    expect(summary[0]).toBe('app,enabled,window_days,active,offered,participated,rate,entries');
    expect(summary[2]).toBe(`payday,true,30,4,3,1,${1 / 3},1`);
    expect(summary.length).toBe(5);

    // The switches of the environment are reported next to the numbers.
    const off = await makeApi({ now: NOW, vars: { FLAG_PAYDAY: 'off' } });
    const other = await off.call('GET', '/api/team/apps', { token: TEAM_PASSPHRASE });
    expect(other.body.summary.map((r: any) => [r.app, r.enabled, r.active])).toEqual([
      ['daily_open', true, 0],
      ['payday', false, 0],
      ['weekly_win', true, 0],
      ['people_nudge', true, 0],
    ]);
    expect(other.body.summary[1].participated).toEqual({ count: 0, of: 0, rate: null });
    expect(other.body.weeks).toEqual([]);
  });

  it('the gates from config next to the actual numbers', async () => {
    const res = await team('/api/team/gates');
    expect(res.status).toBe(200);
    expect(res.body.demoPeople).toBe(1);
    expect(res.body.gates).toEqual([
      // 7 people started a check, 6 completed one.
      { id: 'completion_rate', stage: 1, from: 'deck', criterion: 0.7, direction: 'at_least', value: 6 / 7, count: 6, of: 7, met: true, note: null },
      // No question events in this dataset: no skip rate, no verdict.
      { id: 'max_item_skip_rate', stage: 1, from: 'deck', criterion: 0.1, direction: 'at_most', value: null, count: null, of: null, met: null, note: null },
      { id: 'retest_correlation', stage: 1, from: 'deck', criterion: 0.75, direction: 'at_least', value: null, count: 0, of: null, met: null, note: null },
      { id: 'day7_return', stage: 2, from: 'deck', criterion: 0.25, direction: 'at_least', value: 0.5, count: 3, of: 6, met: true, note: null },
      { id: 'day30_return', stage: 2, from: 'deck', criterion: 0.12, direction: 'at_least', value: 0.25, count: 1, of: 4, met: true, note: null },
      { id: 'payday_share', stage: 2, from: 'brief', criterion: 0.5, direction: 'at_least', value: 1 / 3, count: 1, of: 3, met: false, note: null },
    ]);
    // The criteria are the values of the config, not copies.
    expect(res.body.gates.map((g: any) => g.criterion)).toEqual([
      GO_CRITERIA.completionRate,
      GO_CRITERIA.maxItemSkipRate,
      GO_CRITERIA.retestCorrelation,
      GO_CRITERIA.dailyOpenDay7Return,
      GO_CRITERIA.dailyOpenDay30Return,
      GO_CRITERIA.paydayCompletionShare,
    ]);
    const lines = (await team('/api/team/gates?format=csv')).text.trim().split('\r\n');
    expect(lines[0]).toBe('gate,stage,from,direction,criterion,value,count,of,met,note');
    expect(lines[4]).toBe('day7_return,2,deck,at_least,0.25,0.5,3,6,true,');
    expect(lines[6]).toBe(`payday_share,2,brief,at_least,0.5,${1 / 3},1,3,false,`);
    expect(lines.length).toBe(7);
  });

  it('a skipped question fills the skip-rate gate once its version has been shown to 30 checks', async () => {
    const other = await makeApi({ now: NOW });
    const db = other.db;
    const event = (session: string, user: string, action: string) =>
      db.query(
        `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, option_index, seconds,
           display_direction, click_position, bank_version, at)
         values ($1, 0, $2, $3, 'B1', 'base', 'en', $4, $5, 'worst_first', $6, '2.1', '2026-03-01T10:01:00.000Z')`,
        [session, action, user, action === 'select' ? 2 : null, action === 'shown' ? null : 3, action === 'select' ? 'middle' : null],
      );
    const person = async (n: number, answer: 'select' | 'skip') => {
      await addPerson(db, { id: `q${n}`, role: 'emp', day0: '2026-03-01', overall: 100 + n });
      await event(`q${n}-s1`, `q${n}`, 'shown');
      await event(`q${n}-s1`, `q${n}`, answer);
    };
    await person(1, 'select');
    await person(2, 'skip');
    const gatesOf = async () => (await other.call('GET', '/api/team/gates', { token: TEAM_PASSPHRASE })).body.gates;
    // B1 was shown twice and skipped once: 50%, from 2 checks. Too few to judge the gate.
    expect((await gatesOf())[1]).toMatchObject({ id: 'max_item_skip_rate', value: null, count: null, of: null, met: null, note: null });

    // 28 more people: q3, q4 and q5 skip. 4 of 30 is 13.3%, over the 10% gate.
    for (let n = 3; n <= 30; n++) await person(n, n <= 5 ? 'skip' : 'select');
    const gates = await gatesOf();
    expect(gates[1]).toMatchObject({ id: 'max_item_skip_rate', value: 4 / 30, count: 4, of: 30, met: false, note: 'B1/base' });
    expect(gates[0]).toMatchObject({ value: 1, count: 30, of: 30, met: true });
    // Nobody is 7 days past a first check that anyone returned from.
    expect(gates[3]).toMatchObject({ id: 'day7_return', value: 0, count: 0, of: 30, met: false });
    expect(gates[5]).toMatchObject({ id: 'payday_share', value: null, of: 0, met: null });
  });

  it('the seven scoring tests as a team table', async () => {
    const res = await team('/api/team/tests');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      generatedAt: NOW,
      demoPeople: 0, // the one simulated person has no completed check
      versions: { algo: 1, bank: '2.1', norm: 'provisional-1' },
      checks: 6,
      people: 6,
      retestPairs: 0,
      consecutivePairs: 0,
      versionPairs: 0,
      versionComparison: null,
    });
    expect(res.body.thresholds).toEqual(JSON.parse(JSON.stringify(EVALUATION)));
    expect(Object.keys(res.body.results)).toEqual([...SEVEN_TESTS]);
    // Six checks are far below the 30 a verdict needs.
    for (const name of SEVEN_TESTS) expect([name, res.body.results[name].verdict]).toEqual([name, 'insufficient_data']);
    expect(res.body.results.range).toMatchObject({ n: 6, overall: { min: 80, max: 120, median: 102.5 } });
    expect(res.body.results.fairness.byRole).toEqual(
      expect.arrayContaining([expect.objectContaining({ group: 'emp', n: 5 }), expect.objectContaining({ group: 'ug4', n: 1 })]),
    );

    const csv = await team('/api/team/tests?format=csv');
    expect(csv.headers.get('x-standing-demo-people')).toBe('0');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe('test,verdict,reasons,n,metric,value');
    expect(lines).toContain('range,insufficient_data,,6,overall.median,102.5');
    expect(lines).toContain('fairness,insufficient_data,,6,byRole.emp.n,5');
    for (const name of SEVEN_TESTS) expect(lines.some((l) => l.startsWith(`${name},`)), name).toBe(true);
  });

  it('the new tables are behind the team passphrase and read only', async () => {
    for (const table of ['daily', 'apps', 'gates', 'tests']) {
      expect((await api.call('GET', `/api/team/${table}`, {})).status, table).toBe(401);
      expect((await api.call('GET', `/api/team/${table}`, { token: 'wrong' })).status, table).toBe(401);
      expect((await api.call('POST', `/api/team/${table}`, { token: TEAM_PASSPHRASE, body: {} })).status, table).toBe(405);
      expect((await team(`/api/team/${table}?format=xml`)).status, table).toBe(400);
    }
  });
});
