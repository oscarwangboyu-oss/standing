/**
 * Funnel events for PostHog, sent from the server only. The browser loads no PostHog script.
 *
 * What leaves the server
 * - Only the events listed in FUNNEL_EVENTS, and only when POSTHOG_KEY is set.
 * - A person is named by a salted SHA-256 hash of the user id, never by the id itself. A check
 *   is named the same way.
 * - Each event carries only the properties built in propertiesOf below. That function reads a
 *   fixed list of fields, so nothing else can travel even when a caller passes more.
 * - Never an answer: no option index, no click position, no display direction, no price, no
 *   background answer.
 * - No IP address and no user agent of the person: the request to PostHog is made by the
 *   server, `$ip` is set to null and location lookup is switched off, so PostHog keeps neither
 *   the server's address nor a place.
 *
 * Sending never throws and is never awaited by a response: the router hands a finished
 * request's events to Deps.forward, which runs the send after the response (see handleApi).
 */
import { MICRO_APPS, type MicroApp } from '../shared/api';
import { POSTHOG_MAX_BATCH, POSTHOG_TIMEOUT_MS } from './config';
import { sha256Hex } from './crypto';
import type { Env, EnvironmentName } from './env';

export const FUNNEL_EVENTS = [
  'check_started',
  'question_shown',
  'question_answered',
  'question_skipped',
  'question_not_applicable',
  'check_completed',
  'result_section_seen',
  'share',
  'visit',
  'micro_app_completed',
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

/**
 * The micro apps of stage 2. A stored entry is forwarded as micro_app_completed with the name
 * of the app and nothing else: no tap, no band, no category, no count.
 */
export { MICRO_APPS, type MicroApp };

/** One funnel event as a handler reports it. */
export interface FunnelEvent {
  name: FunnelEventName;
  /** The user id. It is hashed before it leaves the server. */
  userId: string;
  /** When it happened, ISO 8601. */
  at: string;
  /** The check it belongs to. Hashed before it leaves the server. */
  sessionId?: string;
  /** Question events: the question and the version shown. */
  itemId?: string;
  versionKey?: string;
  /** Question answers: seconds from display to tap. */
  seconds?: number | null;
  /** Question events: zero-based position of the question on the person's path. */
  position?: number;
  /** result_section_seen and share: the section of the result page. */
  section?: string;
  /** micro_app_completed: which one. */
  app?: MicroApp;
}

export interface PosthogEvent {
  event: FunnelEventName;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface PosthogBatch {
  api_key: string;
  batch: PosthogEvent[];
}

export type PosthogConfig = Env['posthog'] & { environment?: EnvironmentName };

export interface SendOptions {
  /** Replacement for the global fetch, for tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** The salt mixed into every hash. The project key stands in when no salt is configured. */
function saltOf(config: PosthogConfig): string {
  return config.salt ?? config.key ?? '';
}

/** What stands in for a user id at PostHog: a salted hash, 64 hex characters. */
export async function distinctIdOf(config: PosthogConfig, userId: string): Promise<string> {
  return sha256Hex(`${saltOf(config)}:user:${userId}`);
}

async function checkIdOf(config: PosthogConfig, sessionId: string): Promise<string> {
  return sha256Hex(`${saltOf(config)}:check:${sessionId}`);
}

/**
 * The properties of one event. This is the whole list of what can be sent: each line reads one
 * named field. A field that is not read here does not reach PostHog.
 */
async function propertiesOf(config: PosthogConfig, event: FunnelEvent): Promise<PosthogEvent['properties']> {
  const properties: PosthogEvent['properties'] = {
    // PostHog stores the sender's address unless the event says otherwise. The sender is this
    // server; null keeps even that out, and the location lookup is switched off with it.
    $ip: null,
    $geoip_disable: true,
    // No person profile is built from these events.
    $process_person_profile: false,
    $lib: 'standing-server',
  };
  if (config.environment) properties.environment = config.environment;
  if (typeof event.sessionId === 'string') properties.check = await checkIdOf(config, event.sessionId);
  if (typeof event.itemId === 'string') properties.item_id = event.itemId;
  if (typeof event.versionKey === 'string') properties.version_key = event.versionKey;
  if (typeof event.seconds === 'number' && Number.isFinite(event.seconds)) properties.seconds = event.seconds;
  if (typeof event.position === 'number' && Number.isInteger(event.position)) properties.position = event.position;
  if (typeof event.section === 'string') properties.section = event.section;
  if (typeof event.app === 'string' && (MICRO_APPS as readonly string[]).includes(event.app)) properties.app = event.app;
  return properties;
}

/** The request bodies for a list of events: one per POSTHOG_MAX_BATCH events. Empty without a key. */
export async function buildBatches(config: PosthogConfig, events: readonly FunnelEvent[]): Promise<PosthogBatch[]> {
  if (!config.key) return [];
  const known = events.filter((e) => (FUNNEL_EVENTS as readonly string[]).includes(e.name));
  const batches: PosthogBatch[] = [];
  for (let start = 0; start < known.length; start += POSTHOG_MAX_BATCH) {
    const batch: PosthogEvent[] = [];
    for (const event of known.slice(start, start + POSTHOG_MAX_BATCH)) {
      batch.push({
        event: event.name,
        distinct_id: await distinctIdOf(config, event.userId),
        timestamp: event.at,
        properties: await propertiesOf(config, event),
      });
    }
    batches.push({ api_key: config.key, batch });
  }
  return batches;
}

/**
 * Sends funnel events to the PostHog capture endpoint. Does nothing without a key. Never
 * throws: a failed or slow request is dropped, because analytics must not break the product.
 * Returns how many events PostHog accepted.
 */
export async function sendFunnelEvents(
  config: PosthogConfig,
  events: readonly FunnelEvent[],
  options: SendOptions = {},
): Promise<number> {
  try {
    if (!config.key || events.length === 0) return 0;
    const doFetch = options.fetch ?? fetch;
    const url = `${config.host.replace(/\/+$/, '')}/batch/`;
    let sent = 0;
    for (const body of await buildBatches(config, events)) {
      const response = await doFetch(url, {
        method: 'POST',
        // The only header set here. Nothing of the person's request is passed on.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? POSTHOG_TIMEOUT_MS),
      });
      if (response.ok) sent += body.batch.length;
    }
    return sent;
  } catch {
    return 0;
  }
}

/**
 * The Deps.forward for an environment: undefined without a key, so the router does not even
 * collect events. `defer` runs the send after the response; it gets a task that never rejects.
 */
export function forwarderFor(
  env: Env,
  defer: (task: () => Promise<void>) => void,
  options: SendOptions = {},
): ((events: FunnelEvent[]) => void) | undefined {
  if (!env.posthog.key) return undefined;
  const config: PosthogConfig = { ...env.posthog, environment: env.environment };
  return (events) => {
    const copy = [...events];
    try {
      defer(async () => {
        await sendFunnelEvents(config, copy, options);
      });
    } catch {
      // Scheduling failed. The events are dropped; the response is not affected.
    }
  };
}
