'use client';

/**
 * The one configured API client of the app, the one event queue, and a small hook layer.
 * No data-fetching library: a shared resource is a value with listeners read through
 * useSyncExternalStore, and useAsync is plain state for a call one screen makes.
 *
 *   const me = useMe();                      // { data, error, loading, loaded, refresh }
 *   const res = await api.postDaily(body);   // a write
 *   applyLive(res.live);                     // the write returned today's prices: no second call
 *   await refreshMe();                       // any other write: read /api/me again
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ApiErrorCode, ConfigResponse, MeLive, MeResponse } from '../shared/api';
import { ApiRequestError, createClient, type StandingClient } from '../shared/client';
import { device, deviceStorage, EMPTY_DEVICE, type DeviceRecord } from './device';
import { createQueue, type EventQueue } from './queue';
import { today } from './today';

// ---------------------------------------------------------------- the client and the queue

/** Every method is one endpoint of src/shared/api.ts. The device token is read on each call. */
export const api: StandingClient = createClient({ getToken: () => device().get().deviceToken });

let defaultQueue: EventQueue | null = null;

/** The event queue of this page: question events and report events (./queue.ts). */
export function queue(): EventQueue {
  if (!defaultQueue) {
    defaultQueue = createQueue({ storage: deviceStorage(), getToken: () => device().get().deviceToken });
  }
  return defaultQueue;
}

/** The code of a failed call: an ApiErrorCode, "network", "bad_response", or "unknown" for anything else. */
export function errorCodeOf(error: unknown): ApiErrorCode | 'network' | 'bad_response' | 'unknown' {
  return error instanceof ApiRequestError ? error.code : 'unknown';
}

/** True when the same call can work later: offline or a server error. */
export function isRetryable(error: unknown): boolean {
  return error instanceof ApiRequestError ? error.retryable : false;
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

// ---------------------------------------------------------------- resources

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  /** A call is on its way. `data` may still hold the previous answer. */
  loading: boolean;
  /** At least one call has answered. */
  loaded: boolean;
}

const IDLE: AsyncState<never> = Object.freeze({ data: null, error: null, loading: false, loaded: false });

/** A value fetched once and shared by every screen, with refresh after writes. */
export interface Resource<T> {
  get(): AsyncState<T>;
  subscribe(listener: () => void): () => void;
  /** Fetches unless it is loaded or on its way. */
  load(): Promise<T | null>;
  /** Fetches again. The previous data stays visible until the new answer arrives. */
  refresh(): Promise<T | null>;
  /** Puts a value in place without a call, for a write that already returned it. */
  set(data: T | null): void;
  /** Forgets everything, for another person on this device. */
  reset(): void;
}

export function createResource<T>(fetcher: () => Promise<T | null>): Resource<T> {
  let state: AsyncState<T> = IDLE;
  let inFlight: Promise<T | null> | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const put = (next: AsyncState<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const refresh = (): Promise<T | null> => {
    const mine = (generation += 1);
    put({ ...state, loading: true, error: null });
    const request = fetcher().then(
      (data) => {
        if (mine === generation) put({ data, error: null, loading: false, loaded: true });
        return data;
      },
      (error: unknown) => {
        if (mine === generation) put({ ...state, error: toError(error), loading: false, loaded: true });
        return state.data;
      },
    );
    inFlight = request;
    void request.finally(() => {
      if (inFlight === request) inFlight = null;
    });
    return request;
  };
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load: () => inFlight ?? (state.loaded && !state.error ? Promise.resolve(state.data) : refresh()),
    refresh,
    set(data) {
      generation += 1;
      put({ data, error: null, loading: false, loaded: true });
    },
    reset() {
      generation += 1;
      inFlight = null;
      put(IDLE);
    },
  };
}

export type ResourceView<T> = AsyncState<T> & { refresh: () => Promise<T | null> };

/** Reads a shared resource and loads it on first use. */
export function useResource<T>(resource: Resource<T>): ResourceView<T> {
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.get,
    () => IDLE as AsyncState<T>,
  );
  useEffect(() => {
    void resource.load();
  }, [resource]);
  return { ...state, refresh: resource.refresh };
}

// ---------------------------------------------------------------- me and config

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Keeps the parts of /api/me the device needs before the network answers: guards, the ticker, consent. */
function cacheMe(me: MeResponse): void {
  const current = device().get();
  const fields = {
    userId: me.user.id,
    profile: me.user,
    ticker: me.user.ticker,
    consent: me.consent,
    hasCheck: me.latest !== null,
  } satisfies Partial<DeviceRecord>;
  const before = {
    userId: current.userId,
    profile: current.profile,
    ticker: current.ticker,
    consent: current.consent,
    hasCheck: current.hasCheck,
  };
  if (!sameJson(before, fields)) device().patch(fields);
}

/**
 * GET /api/me for the person on this device, with the device's own date. null without a
 * device token. A token the server no longer knows (the data was deleted elsewhere) is
 * dropped: the account fields go, what never left the device stays.
 */
export const meResource: Resource<MeResponse> = createResource<MeResponse>(async () => {
  if (!device().get().deviceToken) return null;
  try {
    const me = await api.me(today());
    cacheMe(me);
    return me;
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'unauthorized') {
      device().forgetAccount({ keepRecoveryCode: true });
      return null;
    }
    throw error;
  }
});

/** GET /api/config: feature switches, versions, consent text versions. */
export const configResource: Resource<ConfigResponse> = createResource<ConfigResponse>(() => api.config());

// Another person on this device (first save, restore, sign out, delete): what was read for
// the previous one must not stay on screen.
if (typeof window !== 'undefined') {
  let lastToken = device().get().deviceToken;
  device().subscribe(() => {
    const token = device().get().deviceToken;
    if (token === lastToken) return;
    lastToken = token;
    meResource.reset();
    if (token) void meResource.load();
  });
}

/** Everything the home page needs. `data` is null without a device token. */
export function useMe(): ResourceView<MeResponse> {
  return useResource(meResource);
}

export function useConfig(): ResourceView<ConfigResponse> {
  return useResource(configResource);
}

/** Reads /api/me again. Call it after a write that changes what /api/me returns. Never throws: the error is on the resource. */
export function refreshMe(): Promise<MeResponse | null> {
  return meResource.refresh();
}

/**
 * Runs a write, then reads /api/me again, and returns what the write returned.
 *
 *   const { comparison } = await write(() => api.acceptInvite(code));
 */
export async function write<T>(call: () => Promise<T>): Promise<T> {
  const result = await call();
  await refreshMe();
  return result;
}

/**
 * Puts the `live` block a micro-app write returned (MicroEntryResponse.live) into the cached
 * /api/me, so the screen shows today's price at once. With no cached /api/me it reads it.
 */
export function applyLive(live: MeLive | null): void {
  const me = meResource.get().data;
  if (me && live) meResource.set({ ...me, live });
  else void refreshMe();
}

/** The device record, re-rendering when it changes. */
export function useDevice(): DeviceRecord {
  const store = device();
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY_DEVICE);
}

// ---------------------------------------------------------------- useAsync

export type AsyncView<T> = AsyncState<T> & {
  /** Runs the call again. */
  refresh: () => Promise<void>;
  /** Replaces the data without a call. */
  set: (data: T | null) => void;
};

/**
 * Runs `load` when the component mounts and when `deps` change. For a read one screen makes:
 *
 *   const comparisons = useAsync(() => api.comparisons(), []);
 *
 * `enabled: false` waits (for example until a device token exists). A slow answer to an older
 * call never overwrites a newer one.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {},
): AsyncView<T> {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: enabled, loaded: false });
  const latest = useRef(load);
  const run = useRef(0);
  useEffect(() => {
    latest.current = load;
  });
  const refresh = useCallback(async () => {
    const mine = (run.current += 1);
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await latest.current();
      if (mine === run.current) setState({ data, error: null, loading: false, loaded: true });
    } catch (error) {
      if (mine === run.current) setState((s) => ({ ...s, error: toError(error), loading: false, loaded: true }));
    }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
    return () => {
      run.current += 1;
    };
    // The caller lists what the call depends on, as with useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refresh, ...deps]);
  const set = useCallback((data: T | null) => {
    run.current += 1;
    setState({ data, error: null, loading: false, loaded: true });
  }, []);
  return { ...state, refresh, set };
}
