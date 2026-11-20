/**
 * Simulated people for the team dashboard and the chart, for local use only.
 *
 * Every person made here has users.is_demo = true, no device token and a recovery hash that no
 * code can match, so nobody can sign in as one of them. The one exception is the demo viewer
 * (`viewer: true`): one more simulated person with 45 days of steady use and a real recovery
 * code, printed by the command, so the market home and the price chart can be looked at with
 * history on this computer. The app shows "Simulated data" on every screen of that record.
 * Every team response reports how many simulated people it includes. Production never contains them: assertSeedAllowed refuses to run
 * there, and against any database that is not on this machine.
 *
 * The data is built the way real data arrives: each check follows the path the engine gives
 * for the answers so far, each question has a "shown" event and an answer, a skip or a "not
 * applicable", and each completed check is scored by the engine. Everything is drawn from
 * seeded random number generators, so the same seed and the same `now` give the same rows.
 *
 * After their first check, some people use the four micro apps: daily entries, payday bands,
 * weekly wins and people nudges, with gaps. Some keep going, some fade out, some stop and come
 * back. Payday amounts are made up in memory, turned into bands by the engine exactly as a
 * device would, and thrown away: only bands are written, as in the real product.
 *
 * The numbers below shape the simulation only. None of them is a claim about real people.
 */
import { CONSENT_VERSIONS, REPORT_SECTIONS, US_STATES } from '../../src/shared/api';
import {
  CURRENT,
  NUDGE_CATEGORIES,
  PAY_FREQUENCIES,
  RETEST_WINDOW_DAYS,
  ROLE_IDS,
  compute,
  dayNumber,
  displayOrderFor,
  getAlgo,
  getBank,
  nextQuestion,
  paydayBandsFor,
  paydayBaselineOf,
  paydayEligible,
  weekOf,
  whereOf,
  type AreaId,
  type NudgeCategory,
  type PayFrequency,
  type PaydayAmounts,
  type Background,
  type Bank,
  type OrderDirection,
  type PreviousPrices,
  type Result,
  type RoleId,
  type Step,
} from '../../src/engine';
import type { Db } from '../../src/server/db';
import { first } from '../../src/server/db';
import type { Env } from '../../src/server/env';
import { newRecoveryCode } from '../../src/server/crypto';
import { hashRecoveryCode } from '../../src/server/handlers/accounts';
import { checkDayOf } from '../../src/server/live';
import { insertResult, stepsOf, type EventRow } from '../../src/server/sessions';
import { isLocalUrl } from './db';

// ---------------------------------------------------------------- settings of the simulation

export const SEED_DEFAULTS = {
  seed: 1,
  people: 330,
  /** Activity is spread over this many days up to `now`. */
  days: 45,
} as const;

const SIM = {
  /** Share of people who give the health consent. The rest get a three-sector check. */
  healthConsentShare: 0.85,
  /** Share of started checks that are completed. */
  completeShare: 0.82,
  /** Share of people with a completed first check who take a second one in the retest window. */
  secondCheckShare: 0.45,
  /** Chance that a question is skipped, and the higher chance on a few questions. */
  skip: { base: 0.025, high: 0.14, highEvery: 13 },
  /** Chance that a question is marked not applicable, and the higher chance on a few questions. */
  notApplicable: { base: 0.012, high: 0.09, highEvery: 17 },
  /** Chance of choosing an option without a score when the version has one. */
  unscoredOptionShare: 0.08,
  /** Spread of a person's level around the middle, and of one answer around the person's level. */
  levelSd: 0.17,
  answerNoise: 0.16,
  /** How much a person's level drifts between two checks, and the smaller noise of a retest. */
  retestDrift: 0.04,
  /** Seconds to answer: median, spread of the log, and the share of very fast taps. */
  seconds: { median: 5, logSd: 0.55, fastShare: 0.06, fastMin: 0.25, fastMax: 0.75 },
  /** Chance of a visit on day 1, 7 and 30 after the first check, and on any other later day. */
  returns: { day1: 0.38, day7: 0.24, day30: 0.11, otherDay: 0.04 },
  /** Result page: chance of reading on to the next section, of a "useful" click, and of sharing. */
  report: { readOn: 0.93, usefulClick: 0.18, usefulYes: 0.74, share: 0.14, dwellMedianMs: 4200 },
  tickerShare: 0.45,
  stateShare: 0.6,
} as const;

/** How simulated people use the micro apps after their first check. Shapes the simulation only. */
const LIVE = {
  /** Share of people with a completed check who use the micro apps at all. */
  useShare: 0.45,
  /** Of those: the share who keep going, and the share who stop and come back. The rest fade out. */
  steadyShare: 0.15,
  returnsShare: 0.25,
  /** Chance of opening the app on a day: steady users, and the first day of users who fade. */
  steadyDayChance: 0.82,
  fadeStartChance: 0.9,
  /** Days after which the chance of a fading user has halved. */
  fadeHalfLifeDays: 5,
  /** Stop and come back: days active at first, days away, and the chance of a day once back. */
  firstStretchDays: { min: 4, max: 10 },
  gapDays: { min: 8, max: 18 },
  backDayChance: 0.75,
  /** Chance that a missed yesterday is filled in today. */
  backfillChance: 0.35,
  /** Chance that one of the three daily taps is left out. */
  tapLeftOut: 0.04,
  /** Chance of a weekly win and of a people nudge in a week with activity. */
  winChance: 0.6,
  nudgeChance: 0.55,
  /** Chance that a payday is reconciled while the person is using the app. */
  paydayChance: 0.8,
  /** Days between paydays for each pay frequency. */
  payEveryDays: { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 } satisfies Record<PayFrequency, number>,
} as const;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- guard

export class SeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefused';
  }
}

/**
 * Throws unless it is safe to write simulated people: never in production, and with
 * DATABASE_URL set only when --force-local-url was given and the URL points at this machine.
 */
export function assertSeedAllowed(env: Env, flags: { forceLocalUrl: boolean }): void {
  if (env.environment === 'production') {
    throw new SeedRefused('Refused: the environment is production. Production never contains simulated data.');
  }
  if (env.databaseUrl) {
    if (!flags.forceLocalUrl) {
      throw new SeedRefused(
        'Refused: DATABASE_URL is set. Demo data goes into the local embedded database. ' +
          'Unset DATABASE_URL, or add --force-local-url when the URL is a Postgres on this machine.',
      );
    }
    if (!isLocalUrl(env.databaseUrl)) {
      throw new SeedRefused('Refused: --force-local-url was given but DATABASE_URL does not point at localhost.');
    }
  }
}

// ---------------------------------------------------------------- random numbers

interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  int(min: number, max: number): number;
  normal(mean: number, sd: number): number;
  chance(p: number): boolean;
  pick<T>(list: readonly T[]): T;
}

/** mulberry32: small, fast, and the same on every machine. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    normal: (mean, sd) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
  };
  return rng;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const dayOf = (at: Date) => at.toISOString().slice(0, 10);

// ---------------------------------------------------------------- one person

interface Person {
  id: string;
  index: number;
  role: RoleId;
  age: number;
  background: Background;
  healthConsent: boolean;
  ticker: string | null;
  usState: string | null;
  /** Level of each sector, 0 to 1. Decides which options the person tends to choose. */
  level: Record<AreaId, number>;
  /** Above 1: slower than most. */
  pace: number;
}

export interface SeedOptions {
  seed?: number;
  people?: number;
  days?: number;
  now: Date;
  /** Also make the demo viewer: one simulated person with steady use and a real recovery code. */
  viewer?: boolean;
}

/** The demo viewer, as the command prints it. */
export interface DemoViewer {
  id: string;
  ticker: string;
  /** Works in Settings, "Use a recovery code", on this computer only. */
  recoveryCode: string;
  checks: number;
  dailyEntries: number;
  weeklyWins: number;
  peopleNudges: number;
  paydayEntries: number;
  firstDay: string;
}

export interface SeedSummary {
  seed: number;
  people: number;
  byRole: Record<string, number>;
  byAge: number[];
  withHealthConsent: number;
  checksStarted: number;
  checksCompleted: number;
  checksLeftOpen: number;
  secondChecks: number;
  questionEvents: number;
  skips: number;
  notApplicable: number;
  results: number;
  reportEvents: number;
  visits: number;
  /** People with at least one micro-app entry, and the rows written for each app. */
  microAppPeople: number;
  dailyEntries: number;
  paydayEntries: number;
  weeklyWins: number;
  peopleNudges: number;
  firstDay: string;
  lastDay: string;
  /** null unless `viewer` was asked for. Not counted in `people`. */
  viewer: DemoViewer | null;
}

interface BuiltCheck {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  events: Array<EventRow & { at: string }>;
  result: Result | null;
}

/** Stable small number from a question id, to pick the few questions with a high skip rate. */
function hashOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function makePerson(rng: Rng, bank: Bank, seed: number, index: number): Person {
  // Roles and age bands cycle, so every role meets every age band.
  const role = ROLE_IDS[index % ROLE_IDS.length];
  const age = Math.floor(index / ROLE_IDS.length) % bank.ages.length;
  const extra: Record<string, number> = {};
  for (const question of bank.extra[role]) extra[question.id] = rng.int(0, question.opts.length - 1);
  const general = rng.normal(0, SIM.levelSd * 0.6);
  const level = {} as Record<AreaId, number>;
  for (const area of bank.order) level[area] = clamp01(0.5 + general + rng.normal(0, SIM.levelSd));
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const ticker = rng.chance(SIM.tickerShare)
    ? Array.from({ length: rng.int(3, 4) }, () => letters[rng.int(0, letters.length - 1)]).join('')
    : null;
  return {
    id: `demo-${seed}-${String(index + 1).padStart(4, '0')}`,
    index,
    role,
    age,
    background: { age, role, extra },
    healthConsent: rng.chance(SIM.healthConsentShare),
    ticker,
    usState: rng.chance(SIM.stateShare) ? rng.pick(US_STATES) : null,
    level,
    pace: Math.exp(rng.normal(0, 0.3)),
  };
}

/** One check: the path, an event pair per question, and the result when it is completed. */
function buildCheck(
  rng: Rng,
  bank: Bank,
  person: Person,
  id: string,
  createdAt: Date,
  options: { complete: boolean; noise: number; previous: PreviousPrices | null },
): BuiltCheck {
  const excludedAreas: AreaId[] = person.healthConsent ? [] : ['B', 'M'];
  const events: BuiltCheck['events'] = [];
  const steps: Step[] = [];
  const meanLevel = bank.order.reduce((sum, area) => sum + person.level[area], 0) / bank.order.length;
  let clock = createdAt.getTime() + rng.int(3, 20) * 1000;
  const firstQuestion = nextQuestion(bank, person.background, steps, { excludedAreas });
  // Someone who leaves does so somewhere along the path, sometimes before the first answer.
  const stopAfter = options.complete ? Infinity : rng.int(0, Math.max(0, (firstQuestion?.total ?? 1) - 2));

  for (;;) {
    const question = nextQuestion(bank, person.background, steps, { excludedAreas });
    if (!question) break;
    const seq = steps.length;
    const direction: OrderDirection = rng.chance(0.5) ? 'best_first' : 'worst_first';
    const base = {
      seq,
      item_id: question.id,
      version_key: question.key,
      lang: 'en' as const,
      display_direction: direction,
    };
    events.push({ ...base, action: 'shown', option_index: null, seconds: null, click_position: null, at: new Date(clock).toISOString() });
    if (seq >= stopAfter) break;

    const seconds = rng.chance(SIM.seconds.fastShare)
      ? SIM.seconds.fastMin + rng.next() * (SIM.seconds.fastMax - SIM.seconds.fastMin)
      : Math.max(0.4, SIM.seconds.median * person.pace * Math.exp(rng.normal(0, SIM.seconds.logSd)));
    const rounded = Math.round(seconds * 100) / 100;
    clock += Math.round(rounded * 1000) + rng.int(200, 900);
    const at = new Date(clock).toISOString();

    const h = hashOf(question.id);
    const skipChance = h % SIM.skip.highEvery === 0 ? SIM.skip.high : SIM.skip.base;
    const naChance = h % SIM.notApplicable.highEvery === 1 ? SIM.notApplicable.high : SIM.notApplicable.base;
    const draw = rng.next();
    let event: EventRow & { at: string };
    if (draw < skipChance) {
      event = { ...base, action: 'skip', option_index: null, seconds: rounded, click_position: null, at };
    } else if (draw < skipChance + naChance) {
      event = { ...base, action: 'na', option_index: null, seconds: rounded, click_position: null, at };
    } else {
      const scores = question.version.s;
      const unscored = scores.flatMap((s, k) => (s === null ? [k] : []));
      let k: number;
      if (unscored.length > 0 && rng.chance(SIM.unscoredOptionShare)) {
        k = rng.pick(unscored);
      } else {
        // The option whose score is nearest to the person's level in the sector, with noise.
        const area = question.section === 'G' ? null : question.section;
        const aim = clamp01((area ? person.level[area] : meanLevel) + rng.normal(0, options.noise));
        k = 0;
        let best = Infinity;
        scores.forEach((s, index) => {
          if (s === null) return;
          const distance = Math.abs(s - aim);
          if (distance < best) {
            best = distance;
            k = index;
          }
        });
      }
      event = {
        ...base,
        action: 'select',
        option_index: k,
        seconds: rounded,
        click_position: whereOf(k, displayOrderFor(question.version, direction)),
        at,
      };
    }
    events.push(event);
    steps.push(...stepsOf([event]));
  }

  if (!options.complete) return { id, createdAt, completedAt: null, events, result: null };
  const result = compute({ bank, background: person.background, steps, excludedAreas, previous: options.previous });
  return { id, createdAt, completedAt: new Date(clock + 2000), events, result };
}

// ---------------------------------------------------------------- writing

async function insertPerson(db: Db, person: Person, createdAt: string): Promise<void> {
  await db.query(
    `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version, general_consent_at,
       health_consent_version, health_consent_at, lang, age, role, us_state, ticker, is_demo)
     values ($1, $2, $3, $2, $4, $2, $5, $6, 'en', $7, $8, $9, $10, true)`,
    [
      person.id,
      createdAt,
      // Not a SHA-256 value, so no recovery code can ever match it.
      `demo:${person.id}`,
      CONSENT_VERSIONS.general,
      person.healthConsent ? CONSENT_VERSIONS.health : null,
      person.healthConsent ? createdAt : null,
      person.age,
      person.role,
      person.usState,
      person.ticker,
    ],
  );
  const consents: Array<{ kind: string; version: string }> = [{ kind: 'general', version: CONSENT_VERSIONS.general }];
  if (person.healthConsent) consents.push({ kind: 'health', version: CONSENT_VERSIONS.health });
  for (const consent of consents) {
    await db.query(`insert into consents (id, user_id, kind, granted, text_version, at) values ($1, $2, $3, true, $4, $5)`, [
      `${person.id}-c-${consent.kind}`,
      person.id,
      consent.kind,
      consent.version,
      createdAt,
    ]);
  }
}

async function insertCheck(db: Db, bank: Bank, person: Person, check: BuiltCheck): Promise<void> {
  await db.query(
    `insert into sessions (id, user_id, created_at, completed_at, local_day, age, role, extra, us_state, ticker, lang,
       bank_version, health_consent)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'en', $11, $12)`,
    [
      check.id,
      person.id,
      check.createdAt.toISOString(),
      check.completedAt ? check.completedAt.toISOString() : null,
      dayOf(check.createdAt),
      person.age,
      person.role,
      JSON.stringify(person.background.extra),
      person.usState,
      person.ticker,
      bank.bank_version,
      person.healthConsent,
    ],
  );
  if (check.events.length > 0) {
    await db.query(
      `insert into question_events (session_id, seq, action, user_id, item_id, version_key, lang, option_index,
         seconds, display_direction, click_position, bank_version, source, at)
       select $1, x.seq, x.action, $2, x.item_id, x.version_key, x.lang, x.option_index, x.seconds,
         x.display_direction, x.click_position, $3, 'questionnaire', x.at
       from jsonb_to_recordset($4::jsonb) as x(seq integer, action text, item_id text, version_key text, lang text,
         option_index integer, seconds double precision, display_direction text, click_position text, at text)`,
      [check.id, person.id, bank.bank_version, JSON.stringify(check.events)],
    );
  }
  if (check.result && check.completedAt) {
    await insertResult(db, check.id, person.id, check.completedAt.toISOString(), check.result);
  }
}

/** How the result page of one completed check was read. Returns the number of rows written. */
async function insertReportEvents(db: Db, rng: Rng, person: Person, check: BuiltCheck): Promise<number> {
  if (!check.result || !check.completedAt) return 0;
  const rows: Array<{ id: string; section: string; kind: string; ms: number | null; useful: boolean | null; at: string }> = [];
  let clock = check.completedAt.getTime() + 1500;
  const add = (section: string, kind: string, ms: number | null, useful: boolean | null) => {
    rows.push({ id: `${check.id}-r${rows.length + 1}`, section, kind, ms, useful, at: new Date(clock).toISOString() });
  };
  for (const section of REPORT_SECTIONS) {
    // The mind notice is on the page only when the result carries it.
    if (section === 'mind_notice' && !check.result.mindNotice) continue;
    if (section === 'timing_note' && check.result.reducedWeight.count === 0) continue;
    add(section, 'seen', null, null);
    const dwell = Math.round(SIM.report.dwellMedianMs * Math.exp(rng.normal(0, 0.7)));
    clock += dwell;
    add(section, 'dwell', Math.min(dwell, 30 * 60 * 1000), null);
    if (rng.chance(SIM.report.usefulClick)) add(section, 'useful', null, rng.chance(SIM.report.usefulYes));
    if (section === 'share' && rng.chance(SIM.report.share)) add(section, 'share', null, null);
    if (!rng.chance(SIM.report.readOn)) break;
  }
  if (rows.length === 0) return 0;
  await db.query(
    `insert into report_events (user_id, id, session_id, section, kind, ms, useful, at)
     select $1, x.id, $2, x.section, x.kind, x.ms, x.useful, x.at
     from jsonb_to_recordset($3::jsonb) as x(id text, section text, kind text, ms integer, useful boolean, at text)`,
    [person.id, check.id, JSON.stringify(rows)],
  );
  return rows.length;
}

async function insertVisits(db: Db, personId: string, days: ReadonlySet<string>): Promise<number> {
  const rows = [...days].sort().map((day) => ({ day, first_at: `${day}T15:00:00.000Z` }));
  await db.query(
    `insert into visits (user_id, day, first_at)
     select $1, x.day, x.first_at from jsonb_to_recordset($2::jsonb) as x(day text, first_at text)
     on conflict do nothing`,
    [personId, JSON.stringify(rows)],
  );
  return rows.length;
}

// ---------------------------------------------------------------- micro apps

interface LiveRows {
  daily: Array<{ day: string; logged_on: string; sleep: number | null; exercise: number | null; state: number | null; at: string }>;
  paydays: Array<{
    id: string;
    day: string;
    periods: number;
    save_share: number | null;
    burden_share: number | null;
    runway: number | null;
    baseline_day: string | null;
    at: string;
  }>;
  wins: Array<{ id: string; day: string; kind: string; hours: number | null; exam: boolean | null; level: string | null; at: string }>;
  nudges: Array<{ id: string; day: string; planned: number } & Record<`reached_${NudgeCategory}`, number> & { at: string }>;
  /** Days on which the person opened the app. They also count as visits. */
  activeDays: Set<string>;
}

/**
 * What one person records in the micro apps from the day of their first completed check to
 * the end of the window. `firstDay` is the UTC midnight of that day, `lastOffset` the number
 * of days after it that the window still holds.
 */
function buildLive(
  rng: Rng,
  bank: Bank,
  person: Person,
  checks: readonly BuiltCheck[],
  firstDay: number,
  lastOffset: number,
  /** The demo viewer always uses the apps, steadily. */
  force?: 'steady',
): LiveRows {
  const rows: LiveRows = { daily: [], paydays: [], wins: [], nudges: [], activeDays: new Set() };
  if (!force && !rng.chance(LIVE.useShare)) return rows;

  // ---- which days the person opens the app
  const draw = rng.next();
  const pattern = force ?? (draw < LIVE.steadyShare ? 'steady' : draw < LIVE.steadyShare + LIVE.returnsShare ? 'returns' : 'fades');
  const stretch = rng.int(LIVE.firstStretchDays.min, LIVE.firstStretchDays.max);
  const gap = rng.int(LIVE.gapDays.min, LIVE.gapDays.max);
  const chanceOn = (offset: number): number => {
    if (pattern === 'steady') return LIVE.steadyDayChance;
    if (pattern === 'fades') return LIVE.fadeStartChance * 0.5 ** (offset / LIVE.fadeHalfLifeDays);
    if (offset < stretch) return LIVE.steadyDayChance;
    return offset < stretch + gap ? 0 : LIVE.backDayChance;
  };
  const dayAt = (offset: number) => dayOf(new Date(firstDay + offset * DAY_MS));
  const timeOn = (day: string) => `${day}T${String(rng.int(13, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:00.000Z`;
  const active: number[] = [];
  for (let offset = 0; offset <= lastOffset; offset += 1) if (rng.chance(chanceOn(offset))) active.push(offset);
  for (const offset of active) rows.activeDays.add(dayAt(offset));

  // ---- daily open: three taps around the person's body and mind levels
  if (person.healthConsent) {
    const tap = (level: number, spread: number): number | null =>
      rng.chance(LIVE.tapLeftOut) ? null : Math.min(4, Math.max(0, Math.round(level * 4 + rng.normal(0, spread))));
    const recorded = new Set<number>();
    const add = (offset: number, loggedOffset: number) => {
      const entry = {
        day: dayAt(offset),
        logged_on: dayAt(loggedOffset),
        // Sleep peaks at the fourth option (7 to 9 hours), so the level is scaled to 0..3.
        sleep: tap(person.level.B * 0.8, 0.8),
        exercise: tap(person.level.B, 1.1),
        state: tap(person.level.M, 0.9),
        at: timeOn(dayAt(loggedOffset)),
      };
      if (entry.sleep === null && entry.exercise === null && entry.state === null) entry.state = 2;
      rows.daily.push(entry);
      recorded.add(offset);
    };
    for (const offset of active) {
      if (offset > 0 && !recorded.has(offset - 1) && rng.chance(LIVE.backfillChance)) add(offset - 1, offset);
      add(offset, offset);
    }
  }

  // ---- weekly win and people nudge: at most one of each in a calendar week with activity
  const weeks = new Map<number, number[]>();
  for (const offset of active) {
    const week = weekOf(dayNumber(dayAt(offset)));
    weeks.set(week, [...(weeks.get(week) ?? []), offset]);
  }
  const maxPeople = getAlgo().live.peopleNudge.maxPerWeek;
  for (const offsets of weeks.values()) {
    if (rng.chance(LIVE.winChance)) {
      const day = dayAt(rng.pick(offsets));
      const kindDraw = rng.next();
      const kind = kindDraw < 0.5 ? 'course' : kindDraw < 0.9 ? 'skill' : 'certificate';
      rows.wins.push({
        id: `${person.id}-win-${rows.wins.length + 1}`,
        day,
        kind,
        hours: kind === 'course' ? Math.min(4, Math.max(0, Math.round(person.level.C * 3 + rng.normal(0, 1)))) : null,
        exam: kind === 'certificate' ? rng.chance(0.7) : null,
        level: kind === 'certificate' ? (rng.chance(0.75) ? 'entry' : 'advanced') : null,
        at: timeOn(day),
      });
    }
    if (rng.chance(LIVE.nudgeChance)) {
      const day = dayAt(rng.pick(offsets));
      const planned = rng.int(1, maxPeople);
      const reached = Object.fromEntries(NUDGE_CATEGORIES.map((c) => [`reached_${c}`, 0])) as Record<`reached_${NudgeCategory}`, number>;
      const count = Math.min(planned, Math.round(planned * clamp01(person.level.N + rng.normal(0, 0.3))));
      for (let i = 0; i < count; i += 1) reached[`reached_${rng.pick(NUDGE_CATEGORIES)}`] += 1;
      rows.nudges.push({ id: `${person.id}-nudge-${rows.nudges.length + 1}`, day, planned, ...reached, at: timeOn(day) });
    }
  }

  // ---- payday: amounts exist only here, in memory. The engine turns them into bands as a device would.
  if (paydayEligible(bank, person.background)) {
    const frequency = rng.pick(PAY_FREQUENCIES);
    const every = LIVE.payEveryDays[frequency];
    const monthlyIncome = 1800 + person.level.W * 6200;
    const setup = { frequency, essentialMonthly: Math.round(monthlyIncome * 0.6) };
    const completed = checks.filter((c) => c.result !== null && c.completedAt !== null);
    const amounts: PaydayAmounts[] = [];
    for (let offset = rng.int(1, every); offset <= lastOffset; offset += every) {
      if (!rng.chance(chanceOn(offset) * LIVE.paydayChance)) continue;
      const day = dayAt(offset);
      const income = Math.round(((monthlyIncome * every) / 30) * (1 + rng.normal(0, 0.05)));
      const spending = Math.round(income * clamp01(1.05 - 0.45 * person.level.W + rng.normal(0, 0.12)) * 1.1);
      // Money available now: a few months of essential spending, more for a stronger wealth level.
      const balance = Math.max(0, Math.round(setup.essentialMonthly * (0.3 + 7 * person.level.W) * (1 + rng.normal(0, 0.15))));
      // Debt paid in the period: a share of take-home pay that shrinks as the wealth level grows.
      const debt = Math.max(0, Math.round(income * clamp01(0.38 - 0.4 * person.level.W + rng.normal(0, 0.06))));
      amounts.push({ day, income, savings: Math.max(0, Math.round((income - spending) * 0.8)), balance, debt });
      // The check in force on the payday: the latest one completed on or before it.
      let inForce: { day: string; steps: Step[] } | null = null;
      for (const check of completed) {
        const checkDay = checkDayOf({ local_day: dayOf(check.createdAt), completed_at: (check.completedAt as Date).toISOString() });
        if (checkDay <= day) inForce = { day: checkDay, steps: stepsOf(check.events) };
      }
      const { bands } = paydayBandsFor({ setup, entries: amounts, baseline: inForce ? paydayBaselineOf(inForce) : null, bankVersion: bank.bank_version });
      rows.paydays.push({
        id: `${person.id}-payday-${rows.paydays.length + 1}`,
        day,
        periods: bands.periods,
        save_share: bands.saveShare,
        burden_share: bands.debtShare ?? null,
        runway: bands.runway,
        baseline_day: bands.baselineDay,
        at: timeOn(day),
      });
      rows.activeDays.add(day);
    }
  }
  return rows;
}

async function insertLive(db: Db, personId: string, rows: LiveRows): Promise<void> {
  if (rows.daily.length > 0) {
    await db.query(
      `insert into daily_entries (user_id, day, logged_on, sleep, exercise, state, at)
       select $1, x.day, x.logged_on, x.sleep, x.exercise, x.state, x.at
       from jsonb_to_recordset($2::jsonb) as x(day text, logged_on text, sleep integer, exercise integer, state integer, at text)`,
      [personId, JSON.stringify(rows.daily)],
    );
  }
  if (rows.paydays.length > 0) {
    await db.query(
      `insert into payday_entries (user_id, id, day, periods, save_share, burden_share, runway, baseline_day, at)
       select $1, x.id, x.day, x.periods, x.save_share, x.burden_share, x.runway, x.baseline_day, x.at
       from jsonb_to_recordset($2::jsonb) as x(id text, day text, periods integer, save_share integer, burden_share integer,
         runway integer, baseline_day text, at text)`,
      [personId, JSON.stringify(rows.paydays)],
    );
  }
  if (rows.wins.length > 0) {
    await db.query(
      `insert into weekly_wins (user_id, id, day, kind, hours, exam, level, at)
       select $1, x.id, x.day, x.kind, x.hours, x.exam, x.level, x.at
       from jsonb_to_recordset($2::jsonb) as x(id text, day text, kind text, hours integer, exam boolean, level text, at text)`,
      [personId, JSON.stringify(rows.wins)],
    );
  }
  if (rows.nudges.length > 0) {
    await db.query(
      `insert into people_nudges (user_id, id, day, planned, reached_family, reached_friend, reached_mentor, reached_work,
         reached_other, at)
       select $1, x.id, x.day, x.planned, x.reached_family, x.reached_friend, x.reached_mentor, x.reached_work,
         x.reached_other, x.at
       from jsonb_to_recordset($2::jsonb) as x(id text, day text, planned integer, reached_family integer,
         reached_friend integer, reached_mentor integer, reached_work integer, reached_other integer, at text)`,
      [personId, JSON.stringify(rows.nudges)],
    );
  }
}

// ---------------------------------------------------------------- the whole run

/** Deletes every simulated person and, through the schema, every row of theirs. Returns how many people went. */
export async function removeDemo(db: Db): Promise<number> {
  const gone = await db.query('delete from users where is_demo returning id');
  return gone.length;
}

/**
 * Writes simulated people, their checks, result page events and visits. Refuses to add a seed
 * that is already in the database. The caller decides whether running is allowed at all
 * (assertSeedAllowed).
 */
export async function seedDemo(db: Db, options: SeedOptions): Promise<SeedSummary> {
  const seed = options.seed ?? SEED_DEFAULTS.seed;
  const people = options.people ?? SEED_DEFAULTS.people;
  const days = options.days ?? SEED_DEFAULTS.days;
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a whole number from 0');
  if (!Number.isInteger(people) || people < 1 || people > 5000) throw new Error('people must be from 1 to 5000');
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('days must be from 1 to 365');

  const taken = await first(db, 'select 1 as x from users where id like $1 limit 1', [`demo-${seed}-%`]);
  if (taken) throw new Error(`Demo data with seed ${seed} is already in this database. Use --reset, or another --seed.`);

  const bank = getBank(CURRENT.bank);
  const rng = makeRng(seed);
  // The window is the `days` whole UTC days before today, so nothing lies in the future and the
  // rows do not depend on the time of day the command runs.
  const end = Date.parse(`${dayOf(options.now)}T00:00:00.000Z`);
  const windowStart = end - days * DAY_MS;
  const summary: SeedSummary = {
    seed,
    people,
    byRole: Object.fromEntries(ROLE_IDS.map((role) => [role, 0])),
    byAge: bank.ages.map(() => 0),
    withHealthConsent: 0,
    checksStarted: 0,
    checksCompleted: 0,
    checksLeftOpen: 0,
    secondChecks: 0,
    questionEvents: 0,
    skips: 0,
    notApplicable: 0,
    results: 0,
    reportEvents: 0,
    visits: 0,
    microAppPeople: 0,
    dailyEntries: 0,
    paydayEntries: 0,
    weeklyWins: 0,
    peopleNudges: 0,
    firstDay: dayOf(new Date(windowStart)),
    lastDay: dayOf(new Date(end - DAY_MS)),
    viewer: null,
  };

  const BATCH = 25;
  for (let start = 0; start < people; start += BATCH) {
    await db.transaction(async (tx) => {
      for (let index = start; index < Math.min(people, start + BATCH); index += 1) {
        const person = makePerson(rng, bank, seed, index);
        summary.byRole[person.role] += 1;
        summary.byAge[person.age] += 1;
        if (person.healthConsent) summary.withHealthConsent += 1;

        // Day 0 is the oldest day of the window. The first check falls anywhere in it, at some
        // time between 08:00 and 22:00 UTC.
        const firstOffset = rng.int(0, days - 1);
        const firstAt = new Date(windowStart + firstOffset * DAY_MS + rng.int(8 * 3600, 22 * 3600) * 1000);
        await insertPerson(tx, person, firstAt.toISOString());

        const checks: BuiltCheck[] = [];
        const firstCheck = buildCheck(rng, bank, person, `${person.id}-s1`, firstAt, {
          complete: rng.chance(SIM.completeShare),
          noise: SIM.answerNoise,
          previous: null,
        });
        checks.push(firstCheck);

        // A retest, when the first check is done and the window leaves room for the gap.
        const gap = rng.int(RETEST_WINDOW_DAYS.min, RETEST_WINDOW_DAYS.max);
        const wantsSecond = rng.chance(SIM.secondCheckShare);
        if (firstCheck.result && wantsSecond && firstOffset + gap <= days - 1) {
          for (const area of bank.order) person.level[area] = clamp01(person.level[area] + rng.normal(0, SIM.retestDrift));
          const secondAt = new Date(firstAt.getTime() + gap * DAY_MS - rng.int(0, 3600) * 1000);
          const r = firstCheck.result;
          checks.push(
            buildCheck(rng, bank, person, `${person.id}-s2`, secondAt, {
              complete: true,
              noise: SIM.answerNoise * 0.6,
              previous: { C: r.sectors.C.price, W: r.sectors.W.price, N: r.sectors.N.price, B: r.sectors.B.price, M: r.sectors.M.price },
            }),
          );
          summary.secondChecks += 1;
        }

        const visitDays = new Set<string>();
        for (const check of checks) {
          await insertCheck(tx, bank, person, check);
          summary.checksStarted += 1;
          summary.questionEvents += check.events.length;
          summary.skips += check.events.filter((e) => e.action === 'skip').length;
          summary.notApplicable += check.events.filter((e) => e.action === 'na').length;
          if (check.result) {
            summary.checksCompleted += 1;
            summary.results += 1;
          } else {
            summary.checksLeftOpen += 1;
          }
          summary.reportEvents += await insertReportEvents(tx, rng, person, check);
          visitDays.add(dayOf(check.createdAt));
        }

        // Later visits: the days the return rates look at, and a few others. Never in the future.
        const firstDay = windowStart + firstOffset * DAY_MS;
        const lastOffset = days - 1 - firstOffset;
        for (let offset = 1; offset <= lastOffset; offset += 1) {
          const chance =
            offset === 1 ? SIM.returns.day1 : offset === 7 ? SIM.returns.day7 : offset === 30 ? SIM.returns.day30 : SIM.returns.otherDay;
          // People who never finished a check come back less.
          if (rng.chance(firstCheck.result ? chance : chance / 3)) visitDays.add(dayOf(new Date(firstDay + offset * DAY_MS)));
        }

        // The micro apps, for people with a completed first check. They draw from a generator of
        // their own, so the checks above are the same rows with and without them.
        if (firstCheck.result) {
          const liveRng = makeRng((Math.imul(seed + 1, 0x9e3779b1) + Math.imul(index + 1, 0x85ebca6b)) >>> 0);
          const live = buildLive(liveRng, bank, person, checks, firstDay, lastOffset);
          await insertLive(tx, person.id, live);
          for (const day of live.activeDays) visitDays.add(day);
          const entries = live.daily.length + live.paydays.length + live.wins.length + live.nudges.length;
          if (entries > 0) summary.microAppPeople += 1;
          summary.dailyEntries += live.daily.length;
          summary.paydayEntries += live.paydays.length;
          summary.weeklyWins += live.wins.length;
          summary.peopleNudges += live.nudges.length;
        }
        summary.visits += await insertVisits(tx, person.id, visitDays);
      }
    });
  }
  if (options.viewer) summary.viewer = await db.transaction((tx) => seedViewer(tx, bank, seed, windowStart, days));
  return summary;
}

/** The demo viewer's levels: a little above the middle in most sectors, so the board has a leader and a laggard. */
const VIEWER = {
  role: 'emp' as RoleId,
  /** 25 to 29. */
  age: 2,
  ticker: 'DEMO',
  usState: 'GA',
  level: { C: 0.62, W: 0.44, N: 0.56, B: 0.6, M: 0.52 } satisfies Record<AreaId, number>,
  /** What changed between the two checks: a little more exercise and sleep, a little less worry. */
  drift: { C: 0.02, W: 0.03, N: 0.0, B: 0.06, M: 0.04 } satisfies Record<AreaId, number>,
  /** The second check, days after the first. Inside the retest window. */
  secondCheckDay: 18,
} as const;

/**
 * One more simulated person for looking at the app with history: two completed checks, steady
 * use of the four micro apps for the whole window, and a real recovery code. Drawn from its own
 * generator, so the other people are the same rows with and without it.
 */
async function seedViewer(db: Db, bank: Bank, seed: number, windowStart: number, days: number): Promise<DemoViewer> {
  const rng = makeRng((Math.imul(seed + 3, 0x27d4eb2d) ^ 0x5bd1e995) >>> 0);
  const extra: Record<string, number> = {};
  for (const question of bank.extra[VIEWER.role]) extra[question.id] = rng.int(0, question.opts.length - 1);
  const person: Person = {
    id: `demo-${seed}-viewer`,
    index: -1,
    role: VIEWER.role,
    age: VIEWER.age,
    background: { age: VIEWER.age, role: VIEWER.role, extra },
    healthConsent: true,
    ticker: VIEWER.ticker,
    usState: VIEWER.usState,
    level: { ...VIEWER.level },
    pace: 1,
  };
  const firstAt = new Date(windowStart + 15 * 3600 * 1000);
  await insertPerson(db, person, firstAt.toISOString());

  const checks: BuiltCheck[] = [];
  const first = buildCheck(rng, bank, person, `${person.id}-s1`, firstAt, { complete: true, noise: SIM.answerNoise * 0.5, previous: null });
  checks.push(first);
  const secondDay = Math.min(VIEWER.secondCheckDay, days - 1);
  if (first.result && secondDay > 0) {
    for (const area of bank.order) person.level[area] = clamp01(person.level[area] + VIEWER.drift[area]);
    const r = first.result;
    checks.push(
      buildCheck(rng, bank, person, `${person.id}-s2`, new Date(firstAt.getTime() + secondDay * DAY_MS + 3600 * 1000), {
        complete: true,
        noise: SIM.answerNoise * 0.4,
        previous: { C: r.sectors.C.price, W: r.sectors.W.price, N: r.sectors.N.price, B: r.sectors.B.price, M: r.sectors.M.price },
      }),
    );
  }
  const visitDays = new Set<string>();
  for (const check of checks) {
    await insertCheck(db, bank, person, check);
    await insertReportEvents(db, rng, person, check);
    visitDays.add(dayOf(check.createdAt));
  }
  const live = buildLive(rng, bank, person, checks, windowStart, days - 1, 'steady');
  await insertLive(db, person.id, live);
  for (const day of live.activeDays) visitDays.add(day);
  await insertVisits(db, person.id, visitDays);

  const recoveryCode = newRecoveryCode();
  await db.query('update users set recovery_hash = $1 where id = $2', [await hashRecoveryCode(recoveryCode), person.id]);
  return {
    id: person.id,
    ticker: VIEWER.ticker,
    recoveryCode,
    checks: checks.filter((c) => c.result !== null).length,
    dailyEntries: live.daily.length,
    weeklyWins: live.wins.length,
    peopleNudges: live.nudges.length,
    paydayEntries: live.paydays.length,
    firstDay: dayOf(firstAt),
  };
}

/** The summary as the command prints it. */
export function formatSeedSummary(summary: SeedSummary, ageLabels: readonly string[]): string {
  const lines = [
    `SIMULATED DATA, seed ${summary.seed}. Every person is flagged is_demo. None of this is real.`,
    `People: ${summary.people} (${summary.withHealthConsent} with the health consent)`,
    `By role: ${Object.entries(summary.byRole).map(([role, n]) => `${role} ${n}`).join(', ')}`,
    `By age band: ${summary.byAge.map((n, i) => `${ageLabels[i] ?? i} ${n}`).join(', ')}`,
    `Checks: ${summary.checksStarted} started, ${summary.checksCompleted} completed, ${summary.checksLeftOpen} left open`,
    `Second checks ${RETEST_WINDOW_DAYS.min} to ${RETEST_WINDOW_DAYS.max} days after the first: ${summary.secondChecks}`,
    `Question events: ${summary.questionEvents} (${summary.skips} skips, ${summary.notApplicable} not applicable)`,
    `Results: ${summary.results}`,
    `Result page events: ${summary.reportEvents}`,
    `Visits: ${summary.visits}`,
    `Micro apps: ${summary.microAppPeople} people. Daily entries ${summary.dailyEntries}, payday checks ${summary.paydayEntries} (bands only), weekly wins ${summary.weeklyWins}, people nudges ${summary.peopleNudges}`,
    `Days covered: ${summary.firstDay} to ${summary.lastDay}`,
  ];
  const v = summary.viewer;
  if (v) {
    lines.push(
      '',
      `Demo viewer ${v.ticker} (simulated, one more person): ${v.checks} checks from ${v.firstDay}, ${v.dailyEntries} daily entries, ${v.weeklyWins} weekly wins, ${v.peopleNudges} people nudges, ${v.paydayEntries} payday checks.`,
      'To look at the app with this history: start the app, open /settings?restore=1 and enter the recovery code',
      `  ${v.recoveryCode}`,
      'Every screen of that record says "Simulated data". Payday amounts stay on a device, so this record has none.',
    );
  }
  return lines.join('\n');
}
