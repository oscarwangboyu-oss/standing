'use client';

/**
 * The check: start, one question at a time, resume, complete.
 *
 * Three layers, each usable on its own:
 * 1. Pure functions over CheckState (no clock, no randomness, no storage, no network).
 * 2. createCheckController: the same steps with storage, the event queue and the API. All of
 *    its dependencies are passed in, so tests run it against the real server code.
 * 3. check() and useCheck(): the controller of this page and its React hook.
 *
 * Rules that come from the product:
 * - There is no way back to a previous question: later questions depend on earlier answers.
 * - The display order is drawn once per question and remembered, so the options do not flip
 *   when the person leaves and comes back.
 * - The answer time runs from the moment the question is on screen. The interface is English,
 *   so every step carries lang "en" and the engine takes the threshold from the English text.
 * - The server computes the result. The device computes it too, at once, for the reveal, and
 *   the stored result replaces it when it arrives.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  CLIENT_ID_PATTERN,
  CONSENT_VERSIONS,
  HEALTH_AREAS,
  TICKER_PATTERN,
  US_STATES,
  clampSeconds,
  type AnswerAction,
  type OverallChange,
  type QuestionEventInput,
  type SessionInfo,
  type SessionResponse,
  type StoredResult,
  type UsState,
} from '../shared/api';
import { ApiRequestError, type StandingClient } from '../shared/client';
import {
  AREA_IDS,
  BANKS,
  CURRENT,
  ROLE_IDS,
  compute,
  displayOrderFor,
  getBank,
  nextQuestion,
  orderDirection,
  thresholdFor,
  whereOf,
  type AreaId,
  type Background,
  type Bank,
  type NextQuestion,
  type OrderDirection,
  type PreviousPrices,
  type Result,
  type SectionId,
  type Step,
} from '../engine';
import type { SectorCode } from '../ui/sectors';
import { api, meResource, queue, refreshMe } from './api';
import { createSlot, device, deviceStorage, newClientId, type DeviceStore, type KeyValueStore, type Slot } from './device';
import type { EventQueue, Rejection } from './queue';
import { today } from './today';

// ================================================================ 1. pure functions

/** The interface is English only. Every step and event carries this. */
export const CHECK_LANG = 'en' as const;

/** The question on screen: which one, and the direction its options were drawn in. */
export interface PendingQuestion {
  /** steps.length at the moment the question is shown. This is the `seq` of its events. */
  seq: number;
  itemId: string;
  versionKey: string;
  direction: OrderDirection;
  /** True once the "shown" event went into the queue. */
  shownQueued: boolean;
}

/** A check in progress, as kept on the device. Plain data. */
export interface CheckState {
  sessionId: string;
  createdAt: string;
  background: Background;
  usState: UsState | null;
  ticker: string | null;
  bankVersion: string;
  healthConsent: boolean;
  /** [] or ["B", "M"]: the sectors left out because the health consent was declined. */
  excludedAreas: AreaId[];
  /** Answered, skipped and not-applicable questions in order. Append only. */
  steps: Step[];
  pending: PendingQuestion | null;
}

export interface StartInput {
  /** Age band, role and the role's background answers (bank.extra[role]). */
  background: Background;
  /** False: body and mind questions are left out and the two sectors stay unlisted. */
  healthConsent: boolean;
  /** Optional US state, by postal code. */
  usState?: string | null;
  /** Optional ticker: 2 to 6 letters or digits. */
  ticker?: string | null;
}

export type StartField = 'age' | 'role' | 'background' | 'usState' | 'ticker';

/** A start that cannot be sent as it is. `field` says what to fix; `questionId` names the background question. */
export class StartError extends Error {
  constructor(
    readonly field: StartField,
    message: string,
    readonly questionId?: string,
  ) {
    super(message);
    this.name = 'StartError';
  }
}

/** Upper case, or null for an empty field. Throws StartError("ticker") for anything but 2 to 6 letters or digits. */
export function normalizeTicker(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  if (!TICKER_PATTERN.test(trimmed)) throw new StartError('ticker', 'a ticker is 2 to 6 letters or digits');
  return trimmed.toUpperCase();
}

/** The first thing wrong with a start, or null when it can be sent. */
export function startProblem(input: StartInput, bank: Bank = getBank()): StartError | null {
  const { background } = input;
  if (!(ROLE_IDS as readonly string[]).includes(background.role)) return new StartError('role', 'pick a role');
  if (!Number.isInteger(background.age) || background.age < 0 || background.age >= bank.ages.length) {
    return new StartError('age', 'pick an age band');
  }
  for (const question of bank.extra[background.role]) {
    const k = background.extra[question.id];
    if (!Number.isInteger(k) || k < 0 || k >= question.opts.length) {
      return new StartError('background', `answer the background question "${question.id}"`, question.id);
    }
  }
  if (input.usState != null && input.usState !== '' && !(US_STATES as readonly string[]).includes(input.usState)) {
    return new StartError('usState', 'not a US state code');
  }
  try {
    normalizeTicker(input.ticker);
  } catch (error) {
    return error as StartError;
  }
  return null;
}

/** The background with only the answers the role asks for: what the server accepts. */
export function cleanBackground(background: Background, bank: Bank = getBank()): Background {
  const extra: Record<string, number> = {};
  for (const question of bank.extra[background.role]) extra[question.id] = background.extra[question.id];
  return { age: background.age, role: background.role, extra };
}

/** A check from what the server knows about it: a new session, or one read back to resume. */
export function checkFromSession(
  session: SessionInfo,
  steps: readonly Step[] = [],
  pending: SessionResponse['pending'] = null,
): CheckState {
  return {
    sessionId: session.id,
    createdAt: session.createdAt,
    background: session.background,
    usState: session.usState,
    ticker: session.ticker,
    bankVersion: session.bankVersion,
    healthConsent: session.healthConsent,
    excludedAreas: [...session.excludedAreas],
    steps: [...steps],
    pending: pending
      ? {
          seq: pending.seq,
          itemId: pending.itemId,
          versionKey: pending.versionKey,
          direction: pending.displayDirection,
          // The server has the "shown" event already.
          shownQueued: true,
        }
      : null,
  };
}

const selection = (state: CheckState) => ({ excludedAreas: state.excludedAreas });

/** The question the person is on, from the engine. null when every question has a step. */
export function questionOf(state: CheckState): NextQuestion | null {
  return nextQuestion(getBank(state.bankVersion), state.background, state.steps, selection(state));
}

export function isFinished(state: CheckState): boolean {
  return questionOf(state) === null;
}

function pendingFits(pending: PendingQuestion | null, state: CheckState, question: NextQuestion): pending is PendingQuestion {
  return (
    pending !== null &&
    pending.seq === state.steps.length &&
    pending.itemId === question.id &&
    pending.versionKey === question.key
  );
}

/**
 * Makes sure the current question has its display direction. A direction already drawn for
 * this question is kept; otherwise `rng` (a number in [0, 1)) draws it. Call it after every
 * change of the steps. On a finished check it clears `pending`.
 */
export function prepareQuestion(state: CheckState, rng: number): CheckState {
  const question = questionOf(state);
  if (!question) return state.pending === null ? state : { ...state, pending: null };
  if (pendingFits(state.pending, state, question)) return state;
  return {
    ...state,
    pending: {
      seq: state.steps.length,
      itemId: question.id,
      versionKey: question.key,
      direction: orderDirection(rng),
      shownQueued: false,
    },
  };
}

/**
 * The "shown" event of the question on screen, once. `event` is null when it was queued
 * before or when there is no question. Needs prepareQuestion first.
 */
export function markShown(state: CheckState): { state: CheckState; event: QuestionEventInput | null } {
  const pending = state.pending;
  if (!pending || pending.shownQueued) return { state, event: null };
  const event: QuestionEventInput = {
    seq: pending.seq,
    action: 'shown',
    itemId: pending.itemId,
    versionKey: pending.versionKey,
    lang: CHECK_LANG,
    optionIndex: null,
    seconds: null,
    displayDirection: pending.direction,
    clickPosition: null,
    bankVersion: state.bankVersion,
  };
  return { state: { ...state, pending: { ...pending, shownQueued: true } }, event };
}

export type Answer =
  /** An option, by its index in the bank (QuestionView.options[i].index), not by its place on screen. */
  | { action: 'select'; optionIndex: number }
  | { action: 'skip' }
  /** Not applicable to this person. Scored like a skip; the team counts the two apart. */
  | { action: 'na' };

const roundSeconds = (seconds: number): number => Math.round(clampSeconds(seconds) * 1000) / 1000;

/**
 * Answers the question on screen. Returns the new state (one more step, no pending question:
 * call prepareQuestion next), the step, and the event to send. `seconds` is the time from the
 * moment the question was shown; a skip and a not-applicable may pass null.
 */
export function answerQuestion(
  state: CheckState,
  answer: Answer,
  seconds: number | null,
): { state: CheckState; step: Step; event: QuestionEventInput } {
  const question = questionOf(state);
  if (!question || !pendingFits(state.pending, state, question)) {
    throw new Error('no question is on screen: call prepareQuestion first');
  }
  const pending = state.pending;
  const action: AnswerAction = answer.action;
  let optionIndex: number | null = null;
  let secs: number | null = seconds === null ? null : roundSeconds(seconds);
  const step: Step = {
    id: question.id,
    key: question.key,
    k: null,
    secs,
    lang: CHECK_LANG,
    order: pending.direction,
    source: 'questionnaire',
  };
  let clickPosition: QuestionEventInput['clickPosition'] = null;
  if (answer.action === 'select') {
    optionIndex = answer.optionIndex;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.version.opts.length) {
      throw new Error(`option ${String(optionIndex)} is not an option of ${question.id}`);
    }
    if (secs === null) throw new Error('a selected answer needs its time in seconds');
    clickPosition = whereOf(optionIndex, displayOrderFor(question.version, pending.direction));
    step.k = optionIndex;
    step.where = clickPosition;
  } else {
    step.reason = answer.action;
  }
  secs = step.secs;
  const event: QuestionEventInput = {
    seq: pending.seq,
    action,
    itemId: question.id,
    versionKey: question.key,
    lang: CHECK_LANG,
    optionIndex,
    seconds: secs,
    displayDirection: pending.direction,
    clickPosition,
    bankVersion: state.bankVersion,
  };
  return { state: { ...state, steps: [...state.steps, step], pending: null }, step, event };
}

export interface SectionCount {
  /** Questions of the section that have a step. */
  built: number;
  /** Questions of the section on this person's path. */
  total: number;
}

/**
 * How far each section is. The engine gives the path only one question at a time, so the rest
 * of it is walked with stand-in skips; a question that depends on an answer still to come is
 * counted under its default route.
 */
export function sectionCounts(state: CheckState): Record<SectionId, SectionCount> {
  const bank = getBank(state.bankVersion);
  const excluded = new Set<SectionId>(state.excludedAreas);
  const counts = Object.fromEntries(
    (['C', 'W', 'N', 'B', 'M', 'G'] as const).map((id) => [id, { built: 0, total: 0 }]),
  ) as Record<SectionId, SectionCount>;
  const seen = new Set<string>();
  for (const step of state.steps) {
    const section = bank.items[step.id]?.area;
    if (!section || excluded.has(section) || seen.has(step.id)) continue;
    seen.add(step.id);
    counts[section].built += 1;
    counts[section].total += 1;
  }
  const steps: Step[] = [...state.steps];
  for (let guardCount = 0; guardCount < 200; guardCount += 1) {
    const question = nextQuestion(bank, state.background, steps, selection(state));
    if (!question) break;
    counts[question.section].total += 1;
    steps.push({ id: question.id, key: question.key, k: null, secs: null, lang: CHECK_LANG, source: 'questionnaire' });
  }
  return counts;
}

export interface QuestionOption {
  /** Index in the bank. Pass it to select(). */
  index: number;
  label: string;
}

/** Everything the question screen shows. English text only; no score is in here. */
export interface QuestionView {
  seq: number;
  id: string;
  versionKey: string;
  section: SectionId;
  /** Ticker code of the sector, or null for the closing question, which belongs to no sector. */
  sector: SectorCode | null;
  /** The small heading of the section, from the bank: "Body", "Money", "Position". */
  sectionName: string;
  /** The question. */
  text: string;
  /** The answers in the order to display them. */
  options: QuestionOption[];
  direction: OrderDirection;
  /** "Question 33 of 42": current counts from 1. */
  position: { current: number; total: number };
  /** "3 of 5 in Body": current counts from 1. */
  inSection: { current: number; total: number };
  /** For the `build` prop of Skyline and SkylineCard: floors built per sector. Excluded sectors are absent. */
  build: Partial<Record<SectorCode, SectionCount>>;
  /** Seconds below which the answer counts at reduced weight. For the dev panel; never shown to users. */
  thresholdSeconds: number;
}

/** The view of the question on screen, or null when the check is finished or not prepared. */
export function viewOf(state: CheckState): QuestionView | null {
  const question = questionOf(state);
  if (!question || !pendingFits(state.pending, state, question)) return null;
  const bank = getBank(state.bankVersion);
  const counts = sectionCounts(state);
  const order = displayOrderFor(question.version, state.pending.direction);
  const build: Partial<Record<SectorCode, SectionCount>> = {};
  for (const area of AREA_IDS) {
    if (state.excludedAreas.includes(area)) continue;
    build[bank.areas[area].tick as SectorCode] = counts[area];
  }
  const section = question.section;
  return {
    seq: state.pending.seq,
    id: question.id,
    versionKey: question.key,
    section,
    sector: section === 'G' ? null : (bank.areas[section].tick as SectorCode),
    sectionName: bank.section[section][CHECK_LANG],
    text: question.version.q[CHECK_LANG],
    options: order.map((index) => ({ index, label: question.version.opts[index][CHECK_LANG] })),
    direction: state.pending.direction,
    position: { current: question.index + 1, total: question.total },
    inSection: { current: Math.min(counts[section].built + 1, counts[section].total), total: counts[section].total },
    build,
    thresholdSeconds: thresholdFor(question.version.q[CHECK_LANG], CHECK_LANG),
  };
}

/** The result computed on the device, for the instant reveal. The stored result of the server replaces it. */
export function localResult(state: CheckState, previous: PreviousPrices | null = null): Result {
  return compute({
    bank: getBank(state.bankVersion),
    background: state.background,
    steps: state.steps,
    excludedAreas: state.excludedAreas,
    previous,
  });
}

/** True when two results show the same prices and grade. The server's is the one that counts either way. */
export function sameResult(local: Result, stored: Result): boolean {
  const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-6);
  return (
    close(local.overall, stored.overall) &&
    local.grade === stored.grade &&
    AREA_IDS.every((area) => close(local.sectors[area].price, stored.sectors[area].price))
  );
}

/** Reads a stored check leniently. null when it is damaged or its question bank is no longer bundled. */
export function reviveCheck(value: unknown): CheckState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<CheckState>;
  if (typeof v.sessionId !== 'string' || !CLIENT_ID_PATTERN.test(v.sessionId)) return null;
  if (typeof v.bankVersion !== 'string' || !Object.hasOwn(BANKS, v.bankVersion)) return null;
  if (typeof v.background !== 'object' || v.background === null || !Array.isArray(v.steps)) return null;
  const state: CheckState = {
    sessionId: v.sessionId,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
    background: v.background,
    usState: (v.usState as UsState | null | undefined) ?? null,
    ticker: typeof v.ticker === 'string' ? v.ticker : null,
    bankVersion: v.bankVersion,
    healthConsent: v.healthConsent === true,
    excludedAreas: Array.isArray(v.excludedAreas) ? v.excludedAreas : v.healthConsent === true ? [] : [...HEALTH_AREAS],
    steps: v.steps,
    pending: v.pending ?? null,
  };
  // The engine validates every step. A state it cannot walk is not resumed.
  questionOf(state);
  return state;
}

// ================================================================ 2. the controller

/**
 * What the result screen shows right after a check.
 * local: computed on this device, the server has not answered yet.
 * stored: the server's result is in `stored` and `change`.
 * waiting: answers are still queued (offline). The local result stands; completing is tried again by complete().
 * error: the server refused. See CheckSnapshot.error.
 */
export interface Reveal {
  sessionId: string;
  status: 'local' | 'stored' | 'waiting' | 'error';
  /** The result computed on the device. Internal 0 to 1 values in it must not be shown. */
  local: Result;
  stored: StoredResult | null;
  /** Change against the previous check. null for the first one and until the server answers. */
  change: OverallChange | null;
  /** The result to show: the server's once it is there, the local one until then. */
  result: Result;
  /** True when the server's prices differ from the local ones. The server's are shown. */
  differs: boolean;
}

export type CheckStatus =
  /** load() has not run yet. */
  | 'idle'
  | 'loading'
  /** No check in progress. */
  | 'none'
  /** A question is on screen: `view` is set. */
  | 'question'
  /** Every question has a step: call complete(). */
  | 'finished'
  /** complete() is running. `reveal` already holds the local result. */
  | 'completing'
  /** The server stored the result: `reveal.status` is "stored". */
  | 'done';

export interface CheckSnapshot {
  status: CheckStatus;
  state: CheckState | null;
  view: QuestionView | null;
  reveal: Reveal | null;
  /** The last thing that went wrong in load, start or complete. Cleared by the next attempt. */
  error: Error | null;
}

const IDLE_SNAPSHOT: CheckSnapshot = Object.freeze({ status: 'idle', state: null, view: null, reveal: null, error: null });

export interface CheckDeps {
  client: Pick<StandingClient, 'createUser' | 'setConsent' | 'createSession' | 'openSession' | 'getSession' | 'completeSession'>;
  device: DeviceStore;
  queue: EventQueue;
  storage: KeyValueStore;
  /** A number in [0, 1). Draws the display direction. */
  random?: () => number;
  /** Seconds on a clock that only moves forward. Times the answers. */
  clock?: () => number;
  /** The device's local date. */
  today?: () => string;
  /** Sector prices of the previous check, for top gainer and top loser in the local result. */
  previous?: () => PreviousPrices | null;
  /** Called after the server stored a result, and after a start: what /api/me returns has changed. */
  onChanged?: () => void;
  /** Taps sooner than this after the question appeared are ignored (a double tap meant for the previous question). */
  minAnswerSeconds?: number;
}

export interface CheckController {
  get(): CheckSnapshot;
  subscribe(listener: () => void): () => void;
  /** Resumes: the check kept on the device first, the open check on the server as fallback. Runs once; `force` runs it again. */
  load(force?: boolean): Promise<CheckSnapshot>;
  /**
   * Starts a check: creates the person's record if this device has none (with the consents),
   * otherwise records a changed consent, then creates the session. Throws StartError for input
   * that cannot be sent and ApiRequestError when the server refuses or cannot be reached.
   */
  start(input: StartInput): Promise<CheckState>;
  /** Tell the controller the question is on screen: the "shown" event goes out and the answer time starts. */
  shown(): void;
  /** `seconds` overrides the measured time (the dev panel and tests use it). */
  select(optionIndex: number, seconds?: number): boolean;
  skip(seconds?: number): boolean;
  notApplicable(seconds?: number): boolean;
  /**
   * Computes the result on the device at once (`reveal`), sends what is still queued, asks the
   * server to complete, and puts the stored result in `reveal`. Never throws: a failure is in
   * `error` and `reveal.status`, and calling it again tries again.
   */
  complete(): Promise<CheckSnapshot>;
  /** Reads the check back from the server, for when the two disagree. */
  resync(): Promise<CheckSnapshot>;
  /** Forgets the check on this device and its queued events. The server keeps it as unfinished. */
  abandon(): void;
  /** Forgets the reveal, once the result screen has moved on to the stored data. */
  clearReveal(): void;
}

export const CHECK_VERSION = 1;
/** A tap within this time of the question appearing cannot be an answer to it. Interface setting, not scoring. */
export const MIN_ANSWER_SECONDS = 0.15;

export function createCheckSlot(storage: KeyValueStore): Slot<CheckState | null> {
  return createSlot<CheckState | null>({ storage, name: 'check', version: CHECK_VERSION, empty: null, revive: reviveCheck });
}

export function createCheckController(deps: CheckDeps): CheckController {
  const random = deps.random ?? Math.random;
  const clock = deps.clock ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
  const minAnswer = deps.minAnswerSeconds ?? MIN_ANSWER_SECONDS;
  const slot = createCheckSlot(deps.storage);
  const listeners = new Set<() => void>();

  let snapshot: CheckSnapshot = IDLE_SNAPSHOT;
  let loading: Promise<CheckSnapshot> | null = null;
  let completing: Promise<CheckSnapshot> | null = null;
  /** The seq of the question whose timer runs, and when it started. */
  let timed: { seq: number; at: number } | null = null;
  /** A session id that was sent and may exist on the server, kept so a retried start does not create a second check. */
  let draftId: string | null = null;

  const emit = (next: Partial<CheckSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
  };

  /** Puts a state in place: draws the direction of its question, stores it, derives the view. */
  const adopt = (state: CheckState | null, more: Partial<CheckSnapshot> = {}) => {
    if (!state) {
      slot.clear();
      timed = null;
      emit({ status: 'none', state: null, view: null, ...more });
      return;
    }
    const prepared = prepareQuestion(state, random());
    slot.set(prepared);
    const view = viewOf(prepared);
    if (timed && timed.seq !== prepared.steps.length) timed = null;
    emit({ status: view ? 'question' : 'finished', state: prepared, view, ...more });
  };

  const readServer = async (sessionId?: string): Promise<CheckState | null> => {
    const response = sessionId ? await deps.client.getSession(sessionId) : (await deps.client.openSession()).open;
    if (!response || response.session.completedAt !== null) return null;
    if (!Object.hasOwn(BANKS, response.session.bankVersion)) return null;
    return checkFromSession(response.session, response.steps, response.pending);
  };

  const load = (force = false): Promise<CheckSnapshot> => {
    if (loading) return loading;
    if (!force && snapshot.status !== 'idle') return Promise.resolve(snapshot);
    loading = (async () => {
      const local = slot.get();
      if (local) {
        adopt(local, { error: null });
        return snapshot;
      }
      if (!deps.device.get().deviceToken) {
        adopt(null, { error: null });
        return snapshot;
      }
      if (snapshot.status === 'idle') emit({ status: 'loading' });
      try {
        adopt(await readServer(), { error: null });
      } catch (error) {
        adopt(null, { error: error instanceof Error ? error : new Error(String(error)) });
      }
      return snapshot;
    })().finally(() => {
      loading = null;
    });
    return loading;
  };

  const resync = async (): Promise<CheckSnapshot> => {
    const sessionId = snapshot.state?.sessionId ?? slot.get()?.sessionId;
    try {
      const state = await readServer(sessionId);
      if (sessionId) deps.queue.dropSession(sessionId);
      adopt(state, { error: null });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'not_found') {
        if (sessionId) deps.queue.dropSession(sessionId);
        adopt(null, { error: null });
      } else {
        emit({ error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    return snapshot;
  };

  // The server refused events for good. Either the check is closed or gone, or the two sides
  // no longer agree on the path: in both cases the server's version is the one to continue from.
  deps.queue.onRejected((rejection: Rejection) => {
    const sessionId = snapshot.state?.sessionId ?? slot.get()?.sessionId;
    if (rejection.kind !== 'question' || rejection.sessionId !== sessionId) return;
    if (completing) return;
    void resync();
  });

  const ensureConsent = async (healthConsent: boolean): Promise<void> => {
    const record = deps.device.get();
    if (!record.deviceToken) {
      const created = await deps.client.createUser({
        consent: { general: CONSENT_VERSIONS.general, health: healthConsent ? CONSENT_VERSIONS.health : null },
        lang: CHECK_LANG,
      });
      deps.device.signIn(created);
      return;
    }
    let consent = record.consent;
    if (!consent || consent.general.version !== CONSENT_VERSIONS.general) {
      consent = (await deps.client.setConsent({ kind: 'general', granted: true, version: CONSENT_VERSIONS.general })).consent;
    }
    if ((consent.health !== null) !== healthConsent || (healthConsent && consent.health?.version !== CONSENT_VERSIONS.health)) {
      consent = (await deps.client.setConsent({ kind: 'health', granted: healthConsent, version: CONSENT_VERSIONS.health })).consent;
    }
    if (consent !== record.consent) deps.device.patch({ consent });
  };

  const start = async (input: StartInput): Promise<CheckState> => {
    const problem = startProblem(input);
    if (problem) throw problem;
    const background = cleanBackground(input.background);
    const ticker = normalizeTicker(input.ticker);
    const usState = input.usState ? (input.usState as UsState) : null;
    emit({ error: null });
    try {
      await ensureConsent(input.healthConsent);
      const day = (deps.today ?? today)();
      const create = (id: string) =>
        deps.client.createSession({
          id,
          background,
          usState,
          ticker,
          lang: CHECK_LANG,
          bankVersion: CURRENT.bank,
          healthConsent: input.healthConsent,
          localDate: day,
        });
      draftId ??= newClientId();
      let response = await create(draftId);
      const matches = (s: SessionInfo) =>
        JSON.stringify(s.background) === JSON.stringify(background) &&
        s.healthConsent === input.healthConsent &&
        s.ticker === ticker &&
        s.usState === usState;
      if (!response.created && !matches(response.session)) {
        // An earlier attempt reached the server with other answers. Leave it and start anew.
        draftId = newClientId();
        response = await create(draftId);
      }
      draftId = null;

      const previousId = slot.get()?.sessionId;
      if (previousId && previousId !== response.session.id) deps.queue.dropSession(previousId);
      // Creating a session is also today's visit on the server.
      deps.device.patch({ ticker: response.session.ticker, lastVisitDay: day });
      adopt(checkFromSession(response.session), { reveal: null, error: null });
      deps.onChanged?.();
      return snapshot.state as CheckState;
    } catch (error) {
      emit({ error: error instanceof Error ? error : new Error(String(error)) });
      throw error;
    }
  };

  const shown = () => {
    const state = snapshot.state;
    if (!state || snapshot.status !== 'question' || !state.pending) return;
    if (!timed || timed.seq !== state.pending.seq) timed = { seq: state.pending.seq, at: clock() };
    const marked = markShown(state);
    if (!marked.event) return;
    slot.set(marked.state);
    snapshot = { ...snapshot, state: marked.state };
    deps.queue.question(state.sessionId, marked.event);
  };

  const answer = (given: Answer, seconds?: number): boolean => {
    const state = snapshot.state;
    if (!state || snapshot.status !== 'question' || !state.pending) return false;
    let secs = seconds;
    if (secs === undefined) {
      // Not on screen yet, or on screen for less time than a tap takes: this tap was not for this question.
      if (!timed || timed.seq !== state.pending.seq) return false;
      secs = clock() - timed.at;
      if (secs < minAnswer) return false;
    }
    // A question answered before its "shown" went out still gets one, in order.
    const marked = markShown(state);
    if (marked.event) deps.queue.question(state.sessionId, marked.event);
    const answered = answerQuestion(marked.state, given, secs);
    timed = null;
    deps.queue.question(state.sessionId, answered.event);
    adopt(answered.state);
    return true;
  };

  const complete = (): Promise<CheckSnapshot> => {
    if (completing) return completing;
    const state = snapshot.state;
    if (!state || !isFinished(state)) return Promise.resolve(snapshot);
    completing = (async () => {
      const local = snapshot.reveal?.sessionId === state.sessionId ? snapshot.reveal.local : localResult(state, deps.previous?.() ?? null);
      const reveal: Reveal = {
        sessionId: state.sessionId,
        status: 'local',
        local,
        stored: null,
        change: null,
        result: local,
        differs: false,
      };
      emit({ status: 'completing', reveal, error: null });
      try {
        const drained = await deps.queue.drain(state.sessionId);
        // A rejection while draining means the server has another path: read it and go on from there.
        const stillQueued = !drained;
        if (stillQueued) {
          emit({ status: 'finished', reveal: { ...reveal, status: 'waiting' }, error: new ApiRequestError(0, 'network', 'answers are still waiting to be sent') });
          return snapshot;
        }
        const response = await deps.client.completeSession(state.sessionId);
        slot.clear();
        timed = null;
        deps.device.patch({ hasCheck: true, ticker: state.ticker });
        emit({
          status: 'done',
          state: null,
          view: null,
          error: null,
          reveal: {
            ...reveal,
            status: 'stored',
            stored: response.stored,
            change: response.change,
            result: response.stored.result,
            differs: !sameResult(local, response.stored.result),
          },
        });
        deps.onChanged?.();
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (error instanceof ApiRequestError && error.code === 'session_incomplete') {
          // The server has fewer answers than this device. Continue from what it has.
          emit({ reveal: null });
          await resync();
        } else if (error instanceof ApiRequestError && error.code === 'not_found') {
          deps.queue.dropSession(state.sessionId);
          adopt(null, { reveal: null, error: failure });
        } else {
          const retryable = error instanceof ApiRequestError && error.retryable;
          emit({ status: 'finished', reveal: { ...reveal, status: retryable ? 'waiting' : 'error' }, error: failure });
        }
      }
      return snapshot;
    })().finally(() => {
      completing = null;
    });
    return completing;
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    start,
    shown,
    select: (optionIndex, seconds) => answer({ action: 'select', optionIndex }, seconds),
    skip: (seconds) => answer({ action: 'skip' }, seconds),
    notApplicable: (seconds) => answer({ action: 'na' }, seconds),
    complete,
    resync,
    abandon() {
      const sessionId = slot.get()?.sessionId;
      if (sessionId) deps.queue.dropSession(sessionId);
      adopt(null, { reveal: null, error: null });
    },
    clearReveal() {
      if (snapshot.reveal) emit({ reveal: null, status: snapshot.status === 'done' ? 'none' : snapshot.status });
    },
  };
}

// ================================================================ 3. this page

let defaultCheck: CheckController | null = null;

/** Sector prices of the latest stored check, for top gainer and top loser in the local result. */
function previousPrices(): PreviousPrices | null {
  const latest = meResource.get().data?.latest;
  if (!latest) return null;
  const prices: PreviousPrices = {};
  for (const area of AREA_IDS) prices[area] = latest.result.sectors[area].price;
  return prices;
}

/** The check controller of this page. It lives across client-side navigation, so /result finds the reveal /check made. */
export function check(): CheckController {
  if (!defaultCheck) {
    defaultCheck = createCheckController({
      client: api,
      device: device(),
      queue: queue(),
      storage: deviceStorage(),
      previous: previousPrices,
      onChanged: () => void refreshMe(),
    });
  }
  return defaultCheck;
}

export type CheckView = CheckSnapshot &
  Pick<CheckController, 'start' | 'select' | 'skip' | 'notApplicable' | 'complete' | 'resync' | 'abandon' | 'clearReveal'>;

/**
 * The check on this device.
 *
 *   const c = useCheck();
 *   c.status === 'question'  -> render c.view; c.select(option.index), c.skip(), c.notApplicable()
 *   c.status === 'finished'  -> await c.complete(), then go to /result (c.reveal has the result at once)
 *
 * It resumes on mount, and it marks the question as shown after the screen has rendered it,
 * which is the moment the answer time starts.
 */
export function useCheck(): CheckView {
  const controller = check();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, () => IDLE_SNAPSHOT);
  useEffect(() => {
    void controller.load();
  }, [controller]);
  const seq = snapshot.status === 'question' ? (snapshot.view?.seq ?? null) : null;
  useEffect(() => {
    if (seq !== null) controller.shown();
  }, [controller, seq]);
  return {
    ...snapshot,
    start: controller.start,
    select: controller.select,
    skip: controller.skip,
    notApplicable: controller.notApplicable,
    complete: controller.complete,
    resync: controller.resync,
    abandon: controller.abandon,
    clearReveal: controller.clearReveal,
  };
}

/** The result of the check that was just finished on this device, or null. For the result screen. */
export function useReveal(): Reveal | null {
  const controller = check();
  return useSyncExternalStore(
    controller.subscribe,
    () => controller.get().reveal,
    () => null,
  );
}
