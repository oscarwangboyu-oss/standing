'use client';

/**
 * What runs around every app screen: where the person stands (for the route guards), the
 * guards themselves, and the page-wide chores (the event queue, other tabs, the daily visit).
 *
 * app/(app)/layout.tsx uses all of it. A page outside that layout that needs the guard (the
 * landing page: a person with a completed check goes to /market) renders <Guard /> once.
 */
import { Suspense, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, meResource, queue, useDevice, useResource } from './api';
import { device, followOtherTabs } from './device';
import { guard, type Standing } from './nav';
import { check } from './session';
import { pingVisit } from './today';

// ---------------------------------------------------------------- where the person stands

const UNKNOWN: Standing = Object.freeze({ known: false, hasCompleted: false, hasOpenCheck: false });

/**
 * What the guards need, from the device record, GET /api/me and the check on this device.
 * `known` is false on the server, while the page hydrates, and until the device and the
 * server have said whether a check exists.
 */
export function useStanding(): Standing {
  const record = useDevice();
  const me = useResource(meResource);
  const controller = check();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, () => null);
  useEffect(() => {
    void controller.load();
  }, [controller]);

  if (snapshot === null || snapshot.status === 'idle' || snapshot.status === 'loading') return UNKNOWN;
  const hasToken = record.deviceToken !== null;
  const hasCompleted = record.hasCheck || (me.data?.latest ?? null) !== null || snapshot.reveal !== null;
  const known = !hasToken || hasCompleted || me.loaded;
  if (!known) return UNKNOWN;
  return { known, hasCompleted, hasOpenCheck: snapshot.state !== null };
}

// ---------------------------------------------------------------- the address

export interface RouteLocation {
  pathname: string;
  /** The query string without the question mark. */
  search: string;
}

let location: RouteLocation | null = null;
let debugSeen = false;
const locationListeners = new Set<() => void>();

function setLocation(next: RouteLocation): void {
  if (new URLSearchParams(next.search).get('debug') === '1') debugSeen = true;
  if (location && location.pathname === next.pathname && location.search === next.search) return;
  location = next;
  for (const listener of [...locationListeners]) listener();
}

const subscribeLocation = (listener: () => void) => {
  locationListeners.add(listener);
  return () => void locationListeners.delete(listener);
};

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function Watcher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // Before paint: the guard waits for this report, and the screen must not blink while it does.
  useBeforePaint(() => {
    setLocation({ pathname, search });
  }, [pathname, search]);
  return null;
}

/**
 * Reports the address of the page to useLocation and useGuard. Render it once per page. It
 * reads the query string, so it sits in its own Suspense boundary and the rest of the page is
 * still rendered on the server.
 */
export function RouteWatcher() {
  return (
    <Suspense fallback={null}>
      <Watcher />
    </Suspense>
  );
}

/** The address as RouteWatcher last reported it. null on the server and until the first report. */
export function useLocation(): RouteLocation | null {
  return useSyncExternalStore(
    subscribeLocation,
    () => location,
    () => null,
  );
}

/**
 * True in development, and once the address has carried ?debug=1 on this page load. It stays
 * true while the person moves between screens.
 */
export function useDebug(): boolean {
  useLocation();
  return process.env.NODE_ENV === 'development' || debugSeen;
}

// ---------------------------------------------------------------- the guard

export interface GuardView {
  /** The person belongs on this route: render the screen. */
  ready: boolean;
  /** Where the person is being sent instead, or null. */
  target: string | null;
  standing: Standing;
}

/**
 * Runs the route guards of ./nav.ts for the route on screen and sends the person on when they
 * belong elsewhere. Needs one <RouteWatcher /> on the page. Until `ready` is true, show a
 * placeholder instead of the screen.
 */
export function useGuard(): GuardView {
  const pathname = usePathname();
  const router = useRouter();
  const where = useLocation();
  const standing = useStanding();
  // The query string must be the one of this route, not of the route the person just left.
  const settled = standing.known && where !== null && where.pathname === pathname;
  const target = settled ? guard(pathname, where.search, standing) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return { ready: settled && target === null, target, standing };
}

/** The guard for a page outside app/(app): renders nothing, redirects when the rules say so. */
export function Guard() {
  useGuard();
  return <RouteWatcher />;
}

// ---------------------------------------------------------------- page-wide chores

/**
 * Once per page: sends queued events and keeps sending them (online, page hide), follows
 * changes made in another tab, and records today's visit once per local day.
 */
export function useRuntime(): void {
  const token = useDevice().deviceToken;
  useEffect(() => {
    const events = queue();
    const detach = events.attach(window);
    const unfollow = followOtherTabs(window);
    void events.flush();
    return () => {
      detach();
      unfollow();
    };
  }, []);
  useEffect(() => {
    if (!token) return;
    const ping = () => {
      if (document.visibilityState === 'visible') void pingVisit({ client: api, device: device() });
    };
    ping();
    document.addEventListener('visibilitychange', ping);
    return () => document.removeEventListener('visibilitychange', ping);
  }, [token]);
}
