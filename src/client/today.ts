/**
 * The device's own day, and the visit ping that goes out once per local day.
 * No React in this file.
 */
import { ApiRequestError, localDateOf, type StandingClient } from '../shared/client';
import type { DeviceStore } from './device';

/** The local date of this device as YYYY-MM-DD. Days are the person's own, never UTC. */
export function today(now: Date = new Date()): string {
  return localDateOf(now);
}

export type VisitOutcome =
  /** The server stored today's visit, or already had it. */
  | 'recorded'
  /** Already sent today from this device: nothing went out. */
  | 'already'
  /** No device token yet: there is nobody to record a visit for. */
  | 'no_user'
  /** The server refused it for good (a device clock more than a day off). Not sent again today. */
  | 'refused'
  /** Offline or a server error. The next page load tries again. */
  | 'failed';

/**
 * POST /api/visits once per local day (PROMPT.md 7.1: return rates). Safe to call on every
 * page load and every time the tab comes back: the device remembers the day it last sent.
 */
export async function pingVisit(deps: {
  client: Pick<StandingClient, 'visit'>;
  device: DeviceStore;
  now?: Date;
}): Promise<VisitOutcome> {
  const record = deps.device.get();
  if (!record.deviceToken) return 'no_user';
  const day = today(deps.now);
  if (record.lastVisitDay === day) return 'already';
  try {
    await deps.client.visit(day);
    deps.device.patch({ lastVisitDay: day });
    return 'recorded';
  } catch (error) {
    if (error instanceof ApiRequestError && !error.retryable && error.code !== 'unauthorized') {
      deps.device.patch({ lastVisitDay: day });
      return 'refused';
    }
    return 'failed';
  }
}
