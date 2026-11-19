// Test harness for the API: the real router over a fresh in-memory Postgres and a clock the
// test controls. Requests go through createApi exactly as they do in the running app.

import {
  CONSENT_VERSIONS,
  type CreateSessionResponse,
  type CreateUserResponse,
  type QuestionEventInput,
} from '@/shared/api';
import {
  BANKS,
  CURRENT,
  displayOrder,
  nextQuestion,
  orderDirection,
  whereOf,
  type AreaId,
  type Background,
  type Bank,
  type NextQuestion,
  type RoleId,
  type Step,
} from '@/engine';
import type { Db } from '@/server/db';
import { readEnv, type Env } from '@/server/env';
import { createApi } from '@/server/router';
import { freshDb } from './db';

export const bank: Bank = BANKS[CURRENT.bank];
export const TEAM_PASSPHRASE = 'test team passphrase';

export interface CallResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export interface TestApi {
  db: Db;
  env: Env;
  /** The current time of the injected clock. */
  now: () => Date;
  setNow: (iso: string) => void;
  advance: (ms: number) => void;
  call: <T = any>(method: string, path: string, opts?: { token?: string | null; body?: unknown; raw?: string }) => Promise<CallResult<T>>;
}

export async function makeApi(options: { vars?: Record<string, string | undefined>; now?: string } = {}): Promise<TestApi> {
  const db = await freshDb();
  const env = readEnv({ STANDING_ENV: 'local', ADMIN_PASSPHRASE: TEAM_PASSPHRASE, ...options.vars });
  let now = new Date(options.now ?? '2026-03-01T12:00:00.000Z');
  const handle = createApi({ db, env, now: () => new Date(now) });
  return {
    db,
    env,
    now: () => new Date(now),
    setNow: (iso) => {
      now = new Date(iso);
    },
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    },
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = {};
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      let body: string | undefined;
      if (opts.raw !== undefined) body = opts.raw;
      else if (opts.body !== undefined) body = JSON.stringify(opts.body);
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await handle(new Request(`http://test.local${path}`, { method, headers, body }));
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text === '' ? null : JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { status: response.status, body: parsed as any, headers: response.headers, text };
    },
  };
}

/** Creates a user through the API. */
export async function newUser(api: TestApi, options: { health?: boolean; lang?: 'zh' | 'en' } = {}): Promise<CreateUserResponse> {
  const res = await api.call<CreateUserResponse>('POST', '/api/users', {
    body: {
      consent: { general: CONSENT_VERSIONS.general, health: options.health === false ? null : CONSENT_VERSIONS.health },
      lang: options.lang ?? 'en',
    },
  });
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${res.text}`);
  return res.body;
}

/** A plain background for a role: 25 to 29, own earnings, first field, some experience. */
export function backgroundFor(role: RoleId, age = 2): Background {
  const extra: Record<string, number> = {};
  for (const q of bank.extra[role]) extra[q.id] = q.id === 'exp' || q.id === 'stage' ? 2 : 0;
  return { age, role, extra };
}

export async function newSession(
  api: TestApi,
  token: string,
  options: { role?: RoleId; healthConsent?: boolean; body?: Record<string, unknown> } = {},
): Promise<CreateSessionResponse['session']> {
  const res = await api.call<CreateSessionResponse>('POST', '/api/sessions', {
    token,
    body: {
      background: backgroundFor(options.role ?? 'emp'),
      lang: 'en',
      bankVersion: CURRENT.bank,
      healthConsent: options.healthConsent ?? true,
      ...options.body,
    },
  });
  if (res.status !== 201) throw new Error(`createSession failed: ${res.status} ${res.text}`);
  return res.body.session;
}

export interface AnswerOptions {
  seconds?: number;
  lang?: 'zh' | 'en';
  /** Random number for the display direction. Below 0.5 shows the best option first. */
  rng?: number;
}

/** The "shown" event of a question. */
export function shownEvent(q: NextQuestion, seq: number, options: AnswerOptions = {}): QuestionEventInput {
  return {
    seq,
    action: 'shown',
    itemId: q.id,
    versionKey: q.key,
    lang: options.lang ?? 'en',
    optionIndex: null,
    seconds: null,
    displayDirection: orderDirection(options.rng ?? 0.7),
    clickPosition: null,
    bankVersion: CURRENT.bank,
  };
}

/** The answer event of a question: a selection of option k, or a skip when k is null. */
export function answerEvent(q: NextQuestion, seq: number, k: number | null, options: AnswerOptions = {}): QuestionEventInput {
  const rng = options.rng ?? 0.7;
  return {
    seq,
    action: k === null ? 'skip' : 'select',
    itemId: q.id,
    versionKey: q.key,
    lang: options.lang ?? 'en',
    optionIndex: k,
    seconds: options.seconds ?? 4,
    displayDirection: orderDirection(rng),
    clickPosition: k === null ? null : whereOf(k, displayOrder(q.version, rng)),
    bankVersion: CURRENT.bank,
  };
}

/** The engine step that the server should rebuild from an answer event. */
export function stepFor(event: QuestionEventInput): Step {
  const step: Step = {
    id: event.itemId,
    key: event.versionKey,
    k: event.optionIndex,
    secs: event.seconds,
    lang: event.lang,
    order: event.displayDirection,
    source: 'questionnaire',
  };
  if (event.clickPosition) step.where = event.clickPosition;
  return step;
}

export type Chooser = (q: NextQuestion, index: number) => number | null;

/**
 * Answers a session through the API the way the app does: one "shown" and one answer event per
 * question, each in its own request. Stops after `limit` questions when given. Returns the
 * steps the client itself would hold.
 */
export async function answer(
  api: TestApi,
  token: string,
  sessionId: string,
  background: Background,
  choose: Chooser,
  options: AnswerOptions & { excludedAreas?: AreaId[]; limit?: number; startSteps?: Step[] } = {},
): Promise<Step[]> {
  const steps: Step[] = [...(options.startSteps ?? [])];
  let asked = 0;
  for (;;) {
    if (options.limit !== undefined && asked >= options.limit) return steps;
    const q = nextQuestion(bank, background, steps, { excludedAreas: options.excludedAreas });
    if (q === null) return steps;
    const seq = steps.length;
    const rng = ((seq * 37) % 100) / 100;
    const shown = await api.call('POST', `/api/sessions/${sessionId}/events`, {
      token,
      body: { events: [shownEvent(q, seq, { ...options, rng })] },
    });
    if (shown.status !== 200) throw new Error(`shown ${q.id} failed: ${shown.status} ${shown.text}`);
    const event = answerEvent(q, seq, choose(q, seq), { ...options, rng });
    const answered = await api.call('POST', `/api/sessions/${sessionId}/events`, { token, body: { events: [event] } });
    if (answered.status !== 200) throw new Error(`answer ${q.id} failed: ${answered.status} ${answered.text}`);
    steps.push(stepFor(event));
    asked += 1;
  }
}

/** Number of rows in a table, optionally for one user. */
export async function countRows(db: Db, table: string, userId?: string): Promise<number> {
  const column = table === 'users' ? 'id' : 'user_id';
  const rows = userId
    ? await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${column} = $1`, [userId])
    : await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return rows[0].n;
}
