// The check on the device: the pure state machine through a full check, and the controller
// against the real API (the router over an in-memory Postgres), with skips, not-applicable
// answers, leaving and coming back, an offline stretch and completion.

import { describe, expect, it } from 'vitest';
import { createDeviceStore, followOtherTabs, memoryStore, storageKey, type KeyValueStore } from '@/client/device';
import { createQueue, type Timers } from '@/client/queue';
import {
  CHECK_LANG,
  StartError,
  answerQuestion,
  checkFromSession,
  cleanBackground,
  createCheckController,
  isFinished,
  localResult,
  markShown,
  normalizeTicker,
  prepareQuestion,
  questionOf,
  reviveCheck,
  sameResult,
  sectionCounts,
  startProblem,
  viewOf,
  type Answer,
  type CheckState,
  type QuestionView,
} from '@/client/session';
import { CURRENT, compute, displayOrderFor, getBank, thresholdFor, whereOf, type AreaId, type Background, type RoleId } from '@/engine';
import type { QuestionEventInput, SessionInfo, SessionResponse } from '@/shared/api';
import { ApiRequestError, createClient } from '@/shared/client';
import { backgroundFor, makeApi, type TestApi } from '../server/helpers/api';

const bank = getBank();
const TODAY = '2026-03-01';

/** A session as the server would describe it, for the pure functions. */
function sessionInfo(role: RoleId, healthConsent: boolean): SessionInfo {
  return {
    id: 'session-0123456789abcdef',
    createdAt: '2026-03-01T12:00:00.000Z',
    completedAt: null,
    background: backgroundFor(role),
    usState: null,
    ticker: 'RIVR',
    lang: 'en',
    bankVersion: CURRENT.bank,
    healthConsent,
    excludedAreas: healthConsent ? [] : ['B', 'M'],
  } as SessionInfo;
}

/** What the person does with question number `seq`: mostly an option, sometimes a skip, sometimes not applicable. */
function choose(view: QuestionView): Answer {
  if (view.seq % 7 === 3) return { action: 'skip' };
  if (view.seq % 11 === 5) return { action: 'na' };
  return { action: 'select', optionIndex: view.options[(view.seq * 3) % view.options.length].index };
}

/** A random source that repeats, so a test run is the same every time. */
function rolls(): () => number {
  let n = 0;
  return () => ((n++ * 37) % 100) / 100;
}

// ================================================================ pure functions

describe.each([
  { role: 'emp' as RoleId, healthConsent: true },
  { role: 'ug4' as RoleId, healthConsent: false },
])('the check as pure functions, role $role, health consent $healthConsent', ({ role, healthConsent }) => {
  const excluded: AreaId[] = healthConsent ? [] : ['B', 'M'];

  it('walks the whole check: one shown and one answer per question, in order, append only', () => {
    const random = rolls();
    let state = prepareQuestion(checkFromSession(sessionInfo(role, healthConsent)), random());
    const events: QuestionEventInput[] = [];
    const sectionsSeen = new Set<string>();
    let total = 0;

    for (let guardCount = 0; guardCount < 200 && !isFinished(state); guardCount += 1) {
      const view = viewOf(state);
      if (!view) throw new Error('a prepared state has a view');
      const question = questionOf(state);
      if (!question) throw new Error('an unfinished check has a question');
      total = view.position.total;
      sectionsSeen.add(view.section);

      // The view is the engine's question, in English, in the order of the drawn direction.
      expect(view.id).toBe(question.id);
      expect(view.text).toBe(question.version.q.en);
      expect(view.position).toEqual({ current: state.steps.length + 1, total: question.total });
      expect(view.options.map((o) => o.index)).toEqual(displayOrderFor(question.version, view.direction));
      expect(view.options.map((o) => o.label)).toEqual(view.options.map((o) => question.version.opts[o.index].en));
      expect(view.thresholdSeconds).toBe(thresholdFor(question.version.q.en, 'en'));
      expect(view.inSection.current).toBeGreaterThanOrEqual(1);
      expect(view.inSection.current).toBeLessThanOrEqual(view.inSection.total);

      // The direction is drawn once: preparing again with another number changes nothing.
      expect(prepareQuestion(state, 0.01)).toBe(state);
      expect(prepareQuestion(state, 0.99)).toBe(state);

      // "Shown" goes out once.
      const marked = markShown(state);
      expect(marked.event).toMatchObject({ seq: state.steps.length, action: 'shown', itemId: view.id, lang: 'en', displayDirection: view.direction, optionIndex: null, seconds: null });
      expect(markShown(marked.state).event).toBeNull();
      events.push(marked.event as QuestionEventInput);

      // Leaving and coming back in the middle of a question: the stored state reads back the same.
      if (state.steps.length === 5) {
        const revived = reviveCheck(JSON.parse(JSON.stringify(marked.state)));
        expect(revived).toEqual(marked.state);
        expect(viewOf(revived as CheckState)).toEqual(viewOf(marked.state));
      }

      const answer = choose(view);
      const before = marked.state;
      const answered = answerQuestion(before, answer, 4 + (view.seq % 5));
      events.push(answered.event);

      // Append only: the earlier state is untouched and its steps are the start of the new ones.
      expect(before.steps).toHaveLength(view.seq);
      expect(answered.state.steps.slice(0, view.seq)).toEqual(before.steps);
      expect(answered.state.steps).toHaveLength(view.seq + 1);
      expect(answered.state.pending).toBeNull();
      expect(answered.event).toMatchObject({ seq: view.seq, action: answer.action, itemId: view.id, versionKey: view.versionKey, displayDirection: view.direction, lang: CHECK_LANG });
      if (answer.action === 'select') {
        expect(answered.step).toMatchObject({ k: answer.optionIndex, secs: 4 + (view.seq % 5), order: view.direction, source: 'questionnaire' });
        expect(answered.event.clickPosition).toBe(whereOf(answer.optionIndex, displayOrderFor(question.version, view.direction)));
        expect(answered.step.where).toBe(answered.event.clickPosition);
      } else {
        expect(answered.step).toMatchObject({ k: null, reason: answer.action });
        expect(answered.event).toMatchObject({ optionIndex: null, clickPosition: null });
      }

      state = prepareQuestion(answered.state, random());
    }

    expect(isFinished(state)).toBe(true);
    expect(state.pending).toBeNull();
    expect(viewOf(state)).toBeNull();
    expect(state.steps).toHaveLength(total);
    expect(events).toHaveLength(total * 2);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: total * 2 }, (_, i) => Math.floor(i / 2)));
    expect(state.steps.some((s) => s.reason === 'skip')).toBe(true);
    expect(state.steps.some((s) => s.reason === 'na')).toBe(true);
    expect(() => answerQuestion(state, { action: 'skip' }, null)).toThrow();

    // Health consent declined: body and mind are never asked and have no price.
    for (const area of excluded) expect(sectionsSeen.has(area)).toBe(false);
    const counts = sectionCounts(state);
    for (const section of sectionsSeen) expect(counts[section as AreaId].built).toBe(counts[section as AreaId].total);

    // The local result is the engine's result for these steps.
    const result = localResult(state);
    expect(result).toEqual(compute({ bank, background: state.background, steps: state.steps, excludedAreas: excluded, previous: null }));
    expect(sameResult(result, result)).toBe(true);
    for (const area of excluded) expect(result.sectors[area].price).toBeNull();
    for (const area of ['C', 'W', 'N'] as const) expect(result.sectors[area].price).not.toBeNull();
  });

  it('leaves the excluded sectors out of the skyline build', () => {
    const state = prepareQuestion(checkFromSession(sessionInfo(role, healthConsent)), 0.2);
    const view = viewOf(state) as QuestionView;
    expect(Object.keys(view.build).sort()).toEqual(healthConsent ? ['BODY', 'MIND', 'NETW', 'SKIL', 'WLTH'] : ['NETW', 'SKIL', 'WLTH']);
    const total = Object.values(view.build).reduce((sum, count) => sum + (count?.total ?? 0), 0);
    expect(total).toBeLessThanOrEqual(view.position.total);
    expect(total).toBeGreaterThan(0);
  });
});

describe('starting', () => {
  const good = { background: backgroundFor('emp'), healthConsent: true };

  it('takes a ticker of 2 to 6 letters or digits and stores it in upper case', () => {
    expect(normalizeTicker('rivr')).toBe('RIVR');
    expect(normalizeTicker(' a1 ')).toBe('A1');
    expect(normalizeTicker('ABC123')).toBe('ABC123');
    expect(normalizeTicker('')).toBeNull();
    expect(normalizeTicker(null)).toBeNull();
    for (const bad of ['a', 'toolong', 'ab-c', 'a b', '河流']) expect(() => normalizeTicker(bad), bad).toThrow(StartError);
  });

  it('names the first thing wrong with a start', () => {
    expect(startProblem(good)).toBeNull();
    expect(startProblem({ ...good, usState: 'GA', ticker: 'rivr' })).toBeNull();
    expect(startProblem({ ...good, usState: '', ticker: '' })).toBeNull();
    expect(startProblem({ ...good, ticker: 'x' })?.field).toBe('ticker');
    expect(startProblem({ ...good, usState: 'ZZ' })?.field).toBe('usState');
    expect(startProblem({ ...good, background: { ...good.background, age: 99 } })?.field).toBe('age');
    expect(startProblem({ ...good, background: { ...good.background, role: 'nobody' as RoleId } })?.field).toBe('role');
    const missing = startProblem({ ...good, background: { ...good.background, extra: {} } });
    expect(missing?.field).toBe('background');
    expect(missing?.questionId).toBe(bank.extra.emp[0].id);
  });

  it('sends only the background answers the role asks for', () => {
    const background: Background = { ...good.background, extra: { ...good.background.extra, leftover: 3 } };
    expect(cleanBackground(background)).toEqual(good.background);
  });

  it('does not resume a stored check that is damaged or from a bank that is no longer bundled', () => {
    const state = prepareQuestion(checkFromSession(sessionInfo('emp', true)), 0.2);
    expect(reviveCheck(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(reviveCheck(null)).toBeNull();
    expect(reviveCheck({ ...state, sessionId: 'x' })).toBeNull();
    expect(reviveCheck({ ...state, bankVersion: 'bank-of-another-year' })).toBeNull();
    expect(reviveCheck({ ...state, steps: 'none' })).toBeNull();
  });
});

// ================================================================ the controller against the real API

interface Net {
  offline: boolean;
  requests: string[];
}

/** A fetch that goes to the real router, or fails like a browser without a connection. */
function fetchInto(server: TestApi, net: Net): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(input);
    net.requests.push(`${method} ${path}`);
    if (net.offline) throw new TypeError('Failed to fetch');
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '') ?? null;
    const res = await server.call(method, path, { token, raw: typeof init?.body === 'string' ? init.body : undefined });
    return new Response(res.text, { status: res.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** Timers that never fire by themselves: the tests flush when "the connection is back". */
const stillTimers: Timers = { set: () => ({}), clear: () => {} };

/** One page load: a device store, a queue and a check controller over the same storage. */
function page(server: TestApi, net: Net, storage: KeyValueStore) {
  const doFetch = fetchInto(server, net);
  const dev = createDeviceStore(storage);
  const getToken = () => dev.get().deviceToken;
  const client = createClient({ fetch: doFetch, getToken });
  const queue = createQueue({ storage, getToken, fetch: doFetch, timers: stillTimers });
  const clock = { seconds: 100 };
  let changed = 0;
  const controller = createCheckController({
    client,
    device: dev,
    queue,
    storage,
    random: rolls(),
    clock: () => clock.seconds,
    today: () => TODAY,
    onChanged: () => {
      changed += 1;
    },
  });
  /** Shows the question, lets `seconds` pass, and answers it the way `choose` says. */
  const answerOne = (seconds = 5): QuestionView => {
    const view = controller.get().view;
    if (!view) throw new Error(`no question on screen (status ${controller.get().status})`);
    controller.shown();
    clock.seconds += seconds;
    const answer = choose(view);
    const done =
      answer.action === 'select' ? controller.select(answer.optionIndex) : answer.action === 'skip' ? controller.skip() : controller.notApplicable();
    if (!done) throw new Error(`the answer to ${view.id} was not taken`);
    return view;
  };
  return { dev, client, queue, controller, clock, answerOne, changed: () => changed };
}

async function serverSession(server: TestApi, token: string, id: string): Promise<SessionResponse> {
  const res = await server.call<SessionResponse>('GET', `/api/sessions/${id}`, { token });
  expect(res.status).toBe(200);
  return res.body;
}

describe('the check controller against the API', () => {
  it('runs a full check for an employee: start, answer, leave and resume on the device and from the server, complete', async () => {
    const server = await makeApi();
    const net: Net = { offline: false, requests: [] };
    const storage = memoryStore();
    const first = page(server, net, storage);

    // Nothing to resume.
    expect(first.controller.get().status).toBe('idle');
    expect((await first.controller.load()).status).toBe('none');

    // Start: the person's record is created with both consents, then the session.
    const started = await first.controller.start({ background: backgroundFor('emp'), healthConsent: true, usState: 'GA', ticker: 'rivr' });
    expect(net.requests.filter((r) => r === 'POST /api/users')).toHaveLength(1);
    expect(started).toMatchObject({ ticker: 'RIVR', usState: 'GA', healthConsent: true, excludedAreas: [], bankVersion: CURRENT.bank });
    const record = first.dev.get();
    expect(record.deviceToken).toBeTruthy();
    expect(record.recoveryCode).toBeTruthy();
    expect(record).toMatchObject({ ticker: 'RIVR', hasCheck: false, lastVisitDay: TODAY });
    expect(record.consent?.health).not.toBeNull();
    expect(first.changed()).toBe(1);
    const token = record.deviceToken as string;
    const sessionId = started.sessionId;
    expect(first.controller.get().status).toBe('question');

    // A tap before the question is on screen, or within a blink of it, is not an answer.
    const firstView = first.controller.get().view as QuestionView;
    expect(first.controller.select(firstView.options[0].index)).toBe(false);
    first.controller.shown();
    first.clock.seconds += 0.05;
    expect(first.controller.skip()).toBe(false);
    expect(first.controller.get().state?.steps).toHaveLength(0);

    // "Shown" goes out the moment the question is on screen, before any answer.
    await first.queue.flush();
    expect((await serverSession(server, token, sessionId)).pending).toMatchObject({ seq: 0, itemId: firstView.id, displayDirection: firstView.direction });

    // Ten questions. The time runs from the moment the question was shown.
    first.clock.seconds += 4.95;
    expect(first.controller.select(firstView.options[1].index)).toBe(true);
    expect(first.controller.get().state?.steps[0]).toMatchObject({ id: firstView.id, k: firstView.options[1].index, secs: 5, lang: 'en' });
    for (let i = 1; i < 10; i += 1) first.answerOne(3 + i);
    await first.queue.flush();
    expect(first.queue.size()).toBe(0);
    const tenSteps = first.controller.get().state?.steps ?? [];
    expect(tenSteps).toHaveLength(10);
    expect(tenSteps.some((s) => s.reason === 'skip')).toBe(true);
    expect(tenSteps.some((s) => s.reason === 'na')).toBe(true);
    expect((await serverSession(server, token, sessionId)).steps).toEqual(tenSteps);

    // The eleventh question is on screen when the person leaves.
    first.controller.shown();
    const leftOn = first.controller.get().view as QuestionView;
    await first.queue.flush();

    // Coming back on the same device: the stored steps, the same question, the same order of options.
    const requestsBefore = net.requests.length;
    const second = page(server, net, storage);
    const resumed = await second.controller.load();
    expect(resumed.status).toBe('question');
    expect(resumed.state?.steps).toEqual(tenSteps);
    expect(resumed.view).toEqual(leftOn);
    expect(net.requests.length).toBe(requestsBefore);
    // "Shown" is not sent a second time for the question the person left on.
    second.controller.shown();
    expect(second.queue.size()).toBe(0);

    // Coming back where the check is not stored (cleared storage, same account): the server has it.
    const elsewhere = memoryStore({ [storageKey('device', 1)]: JSON.stringify(second.dev.get()) });
    const third = page(server, net, elsewhere);
    const fromServer = await third.controller.load();
    expect(net.requests.at(-1)).toBe('GET /api/sessions/open');
    expect(fromServer.status).toBe('question');
    expect(fromServer.state?.steps).toEqual(tenSteps);
    expect(fromServer.view).toEqual(leftOn);

    // The rest of the check, on the second page load.
    let guardCount = 0;
    while (second.controller.get().status === 'question' && guardCount++ < 200) second.answerOne();
    expect(second.controller.get().status).toBe('finished');
    const finalState = second.controller.get().state as CheckState;
    expect(finalState.steps.slice(0, 10)).toEqual(tenSteps);
    expect(finalState.steps).toHaveLength(leftOn.position.total);

    // Complete: the local result is there at once, the server's replaces it, and they agree.
    const completing = second.controller.complete();
    expect(second.controller.get().status).toBe('completing');
    expect(second.controller.get().reveal).toMatchObject({ status: 'local', sessionId, stored: null });
    const done = await completing;
    expect(done.status).toBe('done');
    expect(done.error).toBeNull();
    expect(done.state).toBeNull();
    expect(done.reveal).toMatchObject({ status: 'stored', differs: false, change: null });
    expect(done.reveal?.stored?.sessionId).toBe(sessionId);
    expect(done.reveal?.result).toEqual(done.reveal?.stored?.result);
    expect(sameResult(localResult(finalState), done.reveal?.stored?.result as never)).toBe(true);
    expect(second.dev.get()).toMatchObject({ hasCheck: true, ticker: 'RIVR' });
    expect(second.queue.size()).toBe(0);
    expect(storage.getItem(storageKey('check', 1))).toBeNull();

    // The server holds exactly the steps the device held, and the check is closed.
    const stored = await serverSession(server, token, sessionId);
    expect(stored.steps).toEqual(finalState.steps);
    expect(stored.session.completedAt).not.toBeNull();

    // Nothing is left to resume, here or on the server.
    const fourth = page(server, net, storage);
    expect((await fourth.controller.load()).status).toBe('none');

    // A second check without the health consent: no new account, the consent is withdrawn, body and mind are left out.
    server.advance(60_000);
    const again = await fourth.controller.start({ background: backgroundFor('emp'), healthConsent: false });
    expect(net.requests.filter((r) => r === 'POST /api/users')).toHaveLength(1);
    expect(again.sessionId).not.toBe(sessionId);
    expect(again).toMatchObject({ healthConsent: false, excludedAreas: ['B', 'M'] });
    expect(fourth.dev.get().consent?.health).toBeNull();
    fourth.controller.clearReveal();
    fourth.controller.abandon();
    expect(fourth.controller.get().status).toBe('none');
  });

  it('runs a full check for a student without the health consent through an offline stretch', async () => {
    const server = await makeApi();
    const net: Net = { offline: false, requests: [] };
    const storage = memoryStore();
    const p = page(server, net, storage);

    // Offline at the start: nothing is created and the error says it can be tried again.
    net.offline = true;
    await expect(p.controller.start({ background: backgroundFor('ug4'), healthConsent: false })).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(p.controller.get().error).toBeInstanceOf(ApiRequestError);
    expect(p.dev.get().deviceToken).toBeNull();
    net.offline = false;

    const started = await p.controller.start({ background: backgroundFor('ug4'), healthConsent: false, ticker: 'ug4' });
    expect(started).toMatchObject({ healthConsent: false, excludedAreas: ['B', 'M'], ticker: 'UG4', usState: null });
    expect(p.dev.get().consent?.health).toBeNull();
    const token = p.dev.get().deviceToken as string;

    // Four questions online, then the connection goes and the person keeps answering.
    const sections = new Set<string>();
    for (let i = 0; i < 4; i += 1) sections.add(p.answerOne().section);
    await p.queue.flush();
    expect(p.queue.size()).toBe(0);

    net.offline = true;
    let guardCount = 0;
    while (p.controller.get().status === 'question' && guardCount++ < 200) sections.add(p.answerOne().section);
    await p.queue.flush();
    expect(p.controller.get().status).toBe('finished');
    const finalState = p.controller.get().state as CheckState;
    expect(sections.has('B')).toBe(false);
    expect(sections.has('M')).toBe(false);
    expect(finalState.steps.some((s) => s.reason === 'skip')).toBe(true);
    expect(p.queue.size()).toBe((finalState.steps.length - 4) * 2);
    expect((await serverSession(server, token, started.sessionId)).steps).toHaveLength(4);

    // Completing offline: the result is shown from the device, and the answers wait.
    const waiting = await p.controller.complete();
    expect(waiting.status).toBe('finished');
    expect(waiting.reveal).toMatchObject({ status: 'waiting', stored: null });
    expect(waiting.reveal?.local.sectors.B.price).toBeNull();
    expect(waiting.reveal?.local.sectors.M.price).toBeNull();
    expect(waiting.reveal?.local.sectors.C.price).not.toBeNull();
    expect(waiting.error).toBeInstanceOf(ApiRequestError);
    expect(p.dev.get().hasCheck).toBe(false);

    // The page is closed and opened again while still offline: everything is still there.
    const later = page(server, net, storage);
    expect((await later.controller.load()).status).toBe('finished');
    expect(later.controller.get().state?.steps).toEqual(finalState.steps);
    expect(later.queue.size()).toBe((finalState.steps.length - 4) * 2);

    // Back online: the queued answers go out in order and the server computes the same prices.
    net.offline = false;
    const done = await later.controller.complete();
    expect(done.status).toBe('done');
    expect(done.reveal).toMatchObject({ status: 'stored', differs: false });
    expect(done.reveal?.stored?.result.sectors.B.price).toBeNull();
    expect(later.queue.size()).toBe(0);
    expect(later.dev.get().hasCheck).toBe(true);
    const stored = await serverSession(server, token, started.sessionId);
    expect(stored.steps).toEqual(finalState.steps);
    expect(stored.session.completedAt).not.toBeNull();

    // Completing again does nothing.
    const requests = net.requests.length;
    expect((await later.controller.complete()).status).toBe('done');
    expect(net.requests.length).toBe(requests);
    later.controller.clearReveal();
    expect(later.controller.get()).toMatchObject({ status: 'none', reveal: null });
  });

  it('a second tab of the same browser follows the tab that answered ahead', async () => {
    const server = await makeApi();
    const net: Net = { offline: false, requests: [] };
    const storage = memoryStore();
    const a = page(server, net, storage);
    await a.controller.load();
    await a.controller.start({ background: backgroundFor('emp'), healthConsent: true, usState: 'GA', ticker: 'twin' });
    a.answerOne();
    // The second tab opens the same check.
    const b = page(server, net, storage);
    await b.controller.load();
    expect(b.controller.get().state?.steps.length).toBe(1);
    // The first tab goes on; the browser tells the second one that storage changed.
    a.answerOne();
    a.answerOne();
    const tabs = new EventTarget();
    const stop = followOtherTabs(tabs as unknown as Window);
    tabs.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
    stop();
    expect(b.controller.get().state?.steps.length).toBe(3);
    expect(b.controller.get().view?.id).toBe(a.controller.get().view?.id);
  });

  it('goes on from the server when the server has another path than the device', async () => {
    const server = await makeApi();
    const net: Net = { offline: false, requests: [] };
    const storage = memoryStore();
    const p = page(server, net, storage);
    const started = await p.controller.start({ background: backgroundFor('emp'), healthConsent: true });
    for (let i = 0; i < 3; i += 1) p.answerOne();
    await p.queue.flush();

    // The device believes it is three questions further than the server (a restored backup of storage).
    const key = storageKey('check', 1);
    const stale = JSON.parse(storage.getItem(key) as string) as CheckState;
    const ahead = memoryStore({ ...storage.dump() });
    const q = page(server, net, ahead);
    await q.controller.load();
    for (let i = 0; i < 3; i += 1) q.answerOne();
    await q.queue.flush();
    expect((await serverSession(server, p.dev.get().deviceToken as string, started.sessionId)).steps).toHaveLength(6);

    // The first page still holds three steps and answers its fourth question another way.
    expect(stale.steps).toHaveLength(3);
    const view = p.controller.get().view as QuestionView;
    p.controller.shown();
    p.clock.seconds += 6;
    const other = view.options.find((o) => o.index !== q.controller.get().state?.steps[3].k) ?? view.options[0];
    expect(p.controller.select(other.index)).toBe(true);
    await p.queue.flush();
    // The first answer to a question wins on the server: the event came back as a duplicate, nothing was refused.
    expect(p.queue.size()).toBe(0);

    // Reading the check back from the server puts the device on the server's path.
    const synced = await p.controller.resync();
    expect(synced.status).toBe('question');
    expect(synced.state?.steps).toEqual(q.controller.get().state?.steps);
    expect(synced.state?.steps).toHaveLength(6);
  });
});
