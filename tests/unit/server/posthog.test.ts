// PostHog forwarding: server side only, only with a key, never an answer value, never the user
// id itself, never an IP address or a user agent, and never in the way of a response.

import { describe, expect, it } from 'vitest';
import { nextQuestion } from '@/engine';
import { readEnv } from '@/server/env';
import { createApi } from '@/server/router';
import {
  FUNNEL_EVENTS,
  buildBatches,
  distinctIdOf,
  forwarderFor,
  sendFunnelEvents,
  type FunnelEvent,
  type PosthogBatch,
} from '@/server/posthog';
import { answerEvent, backgroundFor, bank, naEvent, shownEvent } from './helpers/api';
import { freshDb } from './helpers/db';

const emp = backgroundFor('emp');

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: PosthogBatch;
}

/** A fetch that records what it was asked to send. */
function recordingFetch(status = 200) {
  const sent: Sent[] = [];
  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      headers: { ...(init?.headers as Record<string, string>) },
      body: JSON.parse(String(init?.body)) as PosthogBatch,
    });
    return new Response('{}', { status });
  }) as typeof fetch;
  return { sent, doFetch };
}

const config = { key: 'phc_test_key', host: 'https://ph.example.test/', salt: 'pepper' };
const event: FunnelEvent = {
  name: 'question_answered',
  userId: 'user-id-0001',
  at: '2026-03-01T12:00:00.000Z',
  sessionId: 'session-id-0001',
  itemId: 'B1',
  versionKey: 'base',
  seconds: 4.2,
  position: 3,
};

describe('sendFunnelEvents', () => {
  it('sends nothing without a key', async () => {
    const { sent, doFetch } = recordingFetch();
    expect(await sendFunnelEvents({ key: null, host: config.host, salt: null }, [event], { fetch: doFetch })).toBe(0);
    expect(await buildBatches({ key: null, host: config.host, salt: 'pepper' }, [event])).toEqual([]);
    expect(sent).toEqual([]);
    expect(forwarderFor(readEnv({ STANDING_ENV: 'local' }), () => undefined)).toBeUndefined();
  });

  it('posts one batch to the capture endpoint with a hashed id and without address or agent', async () => {
    const { sent, doFetch } = recordingFetch();
    expect(await sendFunnelEvents(config, [event, { ...event, name: 'visit' }], { fetch: doFetch })).toBe(2);
    expect(sent.length).toBe(1);
    expect(sent[0].url).toBe('https://ph.example.test/batch/');
    expect(sent[0].headers).toEqual({ 'content-type': 'application/json' });
    expect(sent[0].body.api_key).toBe('phc_test_key');
    const first = sent[0].body.batch[0];
    expect(first).toEqual({
      event: 'question_answered',
      distinct_id: await distinctIdOf(config, 'user-id-0001'),
      timestamp: '2026-03-01T12:00:00.000Z',
      properties: {
        $ip: null,
        $geoip_disable: true,
        $process_person_profile: false,
        $lib: 'standing-server',
        check: first.properties.check,
        item_id: 'B1',
        version_key: 'base',
        seconds: 4.2,
        position: 3,
      },
    });
    // The person and the check are named by salted hashes, never by their ids.
    expect(first.distinct_id).toMatch(/^[0-9a-f]{64}$/);
    expect(first.properties.check).toMatch(/^[0-9a-f]{64}$/);
    const text = JSON.stringify(sent);
    expect(text).not.toContain('user-id-0001');
    expect(text).not.toContain('session-id-0001');
    expect(text.toLowerCase()).not.toContain('user_agent');
    expect(text.toLowerCase()).not.toContain('user-agent');
    // Another salt gives another id for the same person.
    expect(await distinctIdOf({ ...config, salt: 'other' }, 'user-id-0001')).not.toBe(first.distinct_id);
  });

  it('drops every field that is not on the list, whatever a caller passes', async () => {
    const { sent, doFetch } = recordingFetch();
    const loaded = {
      ...event,
      optionIndex: 4,
      option_index: 4,
      k: 4,
      clickPosition: 'first',
      displayDirection: 'best_first',
      price: 112.5,
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
    } as unknown as FunnelEvent;
    await sendFunnelEvents(config, [loaded, { ...loaded, name: 'made_up' as never }], { fetch: doFetch });
    expect(sent[0].body.batch.length).toBe(1);
    expect(Object.keys(sent[0].body.batch[0].properties).sort()).toEqual(
      ['$geoip_disable', '$ip', '$lib', '$process_person_profile', 'check', 'item_id', 'position', 'seconds', 'version_key'].sort(),
    );
    const text = JSON.stringify(sent);
    for (const word of ['option', 'click', 'direction', 'price', '203.0.113.9', 'Mozilla']) expect(text, word).not.toContain(word);
  });

  it('never throws: a failing, refusing or hanging endpoint is given up on', async () => {
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await sendFunnelEvents(config, [event], { fetch: failing })).toBe(0);
    expect(await sendFunnelEvents(config, [event], { fetch: recordingFetch(500).doFetch })).toBe(0);
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const started = Date.now();
    expect(await sendFunnelEvents(config, [event], { fetch: hanging, timeoutMs: 30 })).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------- through the API

/** The API with forwarding on. Deferred sends are collected and run by the test. */
async function apiWithPosthog(vars: Record<string, string | undefined> = { POSTHOG_KEY: 'phc_test_key' }) {
  const db = await freshDb();
  const env = readEnv({ STANDING_ENV: 'local', POSTHOG_HOST: 'https://ph.example.test', ...vars });
  const { sent, doFetch } = recordingFetch();
  const deferred: Array<() => Promise<void>> = [];
  const forward = forwarderFor(env, (task) => void deferred.push(task), { fetch: doFetch });
  const handle = createApi({ db, env, now: () => new Date('2026-03-01T12:00:00.000Z'), forward });
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'user-agent': 'Mozilla/5.0 (test browser)', 'x-forwarded-for': '203.0.113.9' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await handle(new Request(`http://test.local${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: response.status, body: (await response.json()) as any };
  };
  const flush = async () => {
    for (const task of deferred.splice(0)) await task();
  };
  return { db, sent, deferred, call, flush };
}

async function runWholeFunnel(api: Awaited<ReturnType<typeof apiWithPosthog>>) {
  const user = (await api.call('POST', '/api/users', undefined, { consent: { general: 'general-1', health: 'health-1' }, lang: 'en' })).body;
  const token = user.deviceToken as string;
  const session = (
    await api.call('POST', '/api/sessions', token, { background: emp, lang: 'en', bankVersion: '2.1', healthConsent: true })
  ).body.session;
  let steps: any[] = [];
  for (;;) {
    const q = nextQuestion(bank, emp, steps);
    if (!q) break;
    const seq = steps.length;
    const answer = seq === 1 ? answerEvent(q, seq, null) : seq === 2 ? naEvent(q, seq) : answerEvent(q, seq, q.version.opts.length - 1, { seconds: 7 });
    const res = await api.call('POST', `/api/sessions/${session.id}/events`, token, { events: [shownEvent(q, seq), answer] });
    if (res.status !== 200) throw new Error(JSON.stringify(res.body));
    steps = (await api.call('GET', `/api/sessions/${session.id}`, token)).body.steps;
  }
  const done = await api.call('POST', `/api/sessions/${session.id}/complete`, token);
  await api.call('POST', '/api/report-events', token, {
    sessionId: session.id,
    events: [
      { id: 'report-event-000001', section: 'chart', kind: 'seen' },
      { id: 'report-event-000002', section: 'chart', kind: 'dwell', ms: 900 },
      { id: 'report-event-000003', section: 'share', kind: 'share' },
      { id: 'report-event-000004', section: 'chart', kind: 'useful', useful: true },
    ],
  });
  await api.call('POST', '/api/visits', token, { localDate: '2026-03-02' });
  return { user, token, session, result: done.body.stored.result, questions: steps.length };
}

describe('forwarding from the API', () => {
  it('sends nothing at all without a key', async () => {
    const api = await apiWithPosthog({ POSTHOG_KEY: undefined });
    await runWholeFunnel(api);
    await api.flush();
    expect(api.deferred).toEqual([]);
    expect(api.sent).toEqual([]);
  });

  it('the response does not wait: the send is deferred until after it', async () => {
    const api = await apiWithPosthog();
    const user = (await api.call('POST', '/api/users', undefined, { consent: { general: 'general-1', health: null }, lang: 'en' })).body;
    const res = await api.call('POST', '/api/visits', user.deviceToken, { localDate: '2026-03-01' });
    expect(res.body).toEqual({ day: '2026-03-01', recorded: true });
    expect(api.deferred.length).toBe(1);
    expect(api.sent).toEqual([]);
    await api.flush();
    expect(api.sent.map((s) => s.body.batch.map((e) => e.event))).toEqual([['visit']]);
    // A visit that was already recorded, and a request that failed, forward nothing.
    await api.call('POST', '/api/visits', user.deviceToken, { localDate: '2026-03-01' });
    await api.call('POST', '/api/visits', user.deviceToken, { localDate: 'yesterday' });
    expect(api.deferred.length).toBe(0);
  });

  it('forwards the funnel of a whole check and never an answer', async () => {
    const api = await apiWithPosthog();
    const { user, session, result, questions } = await runWholeFunnel(api);
    await api.flush();
    const events = api.sent.flatMap((s) => s.body.batch);
    const count = (name: string) => events.filter((e) => e.event === name).length;

    expect(count('check_started')).toBe(1);
    expect(count('question_shown')).toBe(questions);
    expect(count('question_answered')).toBe(questions - 2);
    expect(count('question_skipped')).toBe(1);
    expect(count('question_not_applicable')).toBe(1);
    expect(count('check_completed')).toBe(1);
    expect(count('result_section_seen')).toBe(1);
    expect(count('share')).toBe(1);
    // Starting a check records the visit of 2026-03-01 inside the same request; the explicit one is 03-02.
    expect(count('visit')).toBe(1);
    for (const e of events) expect(FUNNEL_EVENTS as readonly string[]).toContain(e.event);

    // Question events carry the question, the version, the time and the place on the path.
    const answered = events.filter((e) => e.event === 'question_answered');
    expect(answered[0].properties).toMatchObject({ item_id: nextQuestion(bank, emp, [])!.id, version_key: 'base', seconds: 7, position: 0 });
    expect(events.find((e) => e.event === 'result_section_seen')!.properties.section).toBe('chart');

    // Every event: only listed properties, one hashed person, address switched off.
    const allowed = new Set([
      '$ip', '$geoip_disable', '$process_person_profile', '$lib', 'environment', 'check', 'item_id', 'version_key', 'seconds', 'position', 'section', 'app',
    ]);
    const ids = new Set(events.map((e) => e.distinct_id));
    expect(ids.size).toBe(1);
    for (const e of events) {
      for (const key of Object.keys(e.properties)) expect(allowed.has(key), `${e.event} ${key}`).toBe(true);
      expect(e.properties.$ip).toBeNull();
      expect(Object.keys(e).sort()).toEqual(['distinct_id', 'event', 'properties', 'timestamp']);
    }

    // No payload contains an option index, a click position, a display direction, a price, the
    // user id, the check id, the device token, the caller's address or the caller's user agent.
    const text = JSON.stringify(api.sent);
    for (const key of ['option', 'optionIndex', 'option_index', '"k"', 'click', 'direction', 'best_first', 'worst_first', 'overall', 'price', 'grade']) {
      expect(text.includes(key), key).toBe(false);
    }
    for (const secret of [user.userId, user.deviceToken, user.recoveryCode, session.id, '203.0.113.9', 'Mozilla', String(result.overall)]) {
      expect(text.includes(secret), secret).toBe(false);
    }
    for (const sent of api.sent) expect(sent.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('a duplicate event is not forwarded twice', async () => {
    const api = await apiWithPosthog();
    const user = (await api.call('POST', '/api/users', undefined, { consent: { general: 'general-1', health: 'health-1' }, lang: 'en' })).body;
    const session = (
      await api.call('POST', '/api/sessions', user.deviceToken, { background: emp, lang: 'en', bankVersion: '2.1', healthConsent: true })
    ).body.session;
    const q = nextQuestion(bank, emp, [])!;
    const body = { events: [shownEvent(q, 0), answerEvent(q, 0, 1)] };
    await api.call('POST', `/api/sessions/${session.id}/events`, user.deviceToken, body);
    await api.call('POST', `/api/sessions/${session.id}/events`, user.deviceToken, body);
    await api.flush();
    const names = api.sent.flatMap((s) => s.body.batch.map((e) => e.event));
    expect(names).toEqual(['check_started', 'question_shown', 'question_answered']);
  });

  it('a forwarder that throws does not break the response', async () => {
    const db = await freshDb();
    const env = readEnv({ STANDING_ENV: 'local', POSTHOG_KEY: 'phc_test_key' });
    const handle = createApi({
      db,
      env,
      now: () => new Date('2026-03-01T12:00:00.000Z'),
      forward: () => {
        throw new Error('scheduler is gone');
      },
    });
    const post = (path: string, token: string | null, body: unknown) =>
      handle(
        new Request(`http://test.local${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body),
        }),
      );
    const user = (await (await post('/api/users', null, { consent: { general: 'general-1', health: null }, lang: 'en' })).json()) as any;
    const res = await post('/api/visits', user.deviceToken, { localDate: '2026-03-01' });
    expect(res.status).toBe(200);
  });
});
