/**
 * The routes of the app and the rules that decide where a person belongs.
 * Pure: no React, no storage, no window. A server component may import it.
 */

export const ROUTES = {
  landing: '/',
  /** Consent and background. */
  start: '/start',
  /** The same screen for a person who already has a check and takes another one. */
  retake: '/start?retake=1',
  /** The questions. */
  check: '/check',
  /** The latest result. resultRoute(id) gives an older one. */
  result: '/result',
  /** Home for a returning person. */
  market: '/market',
  /** Daily Open. */
  open: '/open',
  /** The hub: Payday Check, Weekly Win, People Nudge, breakdown history. */
  log: '/log',
  payday: '/log/payday',
  win: '/log/win',
  people: '/log/people',
  /** My comparisons, and making an invite. */
  compare: '/compare',
  settings: '/settings',
  /** Settings with the recovery code sheet open, for a person on a new device. */
  restore: '/settings?restore=1',
  team: '/team',
  about: '/about',
  method: '/method',
  privacy: '/privacy',
  terms: '/terms',
} as const;

export type RouteName = keyof typeof ROUTES;

/** /result?session=ID, the result of an older check. */
export function resultRoute(sessionId?: string | null): string {
  return sessionId ? `${ROUTES.result}?session=${encodeURIComponent(sessionId)}` : ROUTES.result;
}

/** /i/CODE, the page someone opens from an invite. */
export function inviteRoute(code: string): string {
  return `/i/${encodeURIComponent(code)}`;
}

/** The four places of the bottom navigation. The ids match NavId of src/ui. */
export const NAV_IDS = ['market', 'open', 'log', 'settings'] as const;
export type NavPlace = (typeof NAV_IDS)[number];

/**
 * How a route is guarded.
 * entry: the front door and the start screen. check: the questions. app: screens that need a
 * completed check. free: no rule (settings so a person can restore or delete at any time, the
 * team dashboard, an invite link, the public pages).
 */
export type RouteKind = 'entry' | 'check' | 'app' | 'free';

function clean(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path || '/';
}

const under = (path: string, base: string): boolean => path === base || path.startsWith(`${base}/`);

export function routeKind(pathname: string): RouteKind {
  const path = clean(pathname);
  if (path === ROUTES.landing || path === ROUTES.start) return 'entry';
  if (path === ROUTES.check) return 'check';
  for (const base of [ROUTES.market, ROUTES.open, ROUTES.log, ROUTES.compare, ROUTES.result]) {
    if (under(path, base)) return 'app';
  }
  return 'free';
}

/** What the guards need to know about the person on this device. */
export interface Standing {
  /**
   * False while it is not known yet whether this person has a check: there is a device token,
   * nothing is cached and GET /api/me has not answered. No guard acts until it is true.
   */
  known: boolean;
  /** A completed check exists, or the result of one was just computed on this device. */
  hasCompleted: boolean;
  /** A check was started and not completed, on this device or on the server. */
  hasOpenCheck: boolean;
}

function hasFlag(search: string | URLSearchParams | null | undefined, name: string): boolean {
  if (!search) return false;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get(name) === '1';
}

/**
 * Where the person should be instead of `pathname`, or null to stay.
 *
 * - A person with a completed check who opens / or /start goes to /market. /start?retake=1
 *   stays: that is how a second check begins.
 * - A person without a completed check who opens an app screen goes to /start.
 * - An unfinished check resumes at /check: from /start always, from an app screen when there
 *   is no completed check to show. The front door itself never traps a person in the check.
 * - /check without an unfinished check leads to the result, or to /start without one.
 */
export function guard(pathname: string, search: string | URLSearchParams | null | undefined, standing: Standing): string | null {
  if (!standing.known) return null;
  const path = clean(pathname);
  switch (routeKind(path)) {
    case 'entry':
      if (path === ROUTES.start) {
        if (standing.hasOpenCheck) return ROUTES.check;
        if (standing.hasCompleted && !hasFlag(search, 'retake')) return ROUTES.market;
        return null;
      }
      return standing.hasCompleted ? ROUTES.market : null;
    case 'check':
      if (standing.hasOpenCheck) return null;
      return standing.hasCompleted ? ROUTES.result : ROUTES.start;
    case 'app':
      if (standing.hasCompleted) return null;
      return standing.hasOpenCheck ? ROUTES.check : ROUTES.start;
    case 'free':
      return null;
  }
}

/** The item of the bottom navigation a route belongs to, or null for a route that is not one of the four places. */
export function navPlaceFor(pathname: string): NavPlace | null {
  const path = clean(pathname);
  if (under(path, ROUTES.market)) return 'market';
  if (under(path, ROUTES.open)) return 'open';
  if (under(path, ROUTES.log)) return 'log';
  if (under(path, ROUTES.settings)) return 'settings';
  return null;
}

/** The frame a route gets from app/(app)/layout.tsx unless the screen asks for something else. */
export interface ShellDefaults {
  /** A place: the navigation with that item current. null: the navigation with no item current. undefined: no navigation. */
  nav: NavPlace | null | undefined;
  /** The main area fills the screen so content can sit at the bottom (the question screen). */
  fill: boolean;
  width: 'col' | 'wide';
  /** The footer with the company line and the two statements. */
  footer: boolean;
}

/**
 * Bottom navigation "where appropriate": on the four places and their sub-screens, and on
 * compare with no item current. Not on start, check and result (one task, no way out by
 * accident), not on an invite (the visitor may have no check) and not on the team dashboard.
 */
export function shellDefaultsFor(pathname: string): ShellDefaults {
  const path = clean(pathname);
  const place = navPlaceFor(path);
  const base: ShellDefaults = { nav: undefined, fill: false, width: 'col', footer: false };
  if (place) return { ...base, nav: place, footer: place === 'settings' };
  if (under(path, ROUTES.compare)) return { ...base, nav: null, width: 'wide' };
  if (path === ROUTES.check) return { ...base, fill: true };
  if (under(path, ROUTES.result)) return { ...base, footer: true };
  if (path === ROUTES.start) return { ...base, footer: true };
  if (under(path, ROUTES.team)) return { ...base, width: 'wide' };
  return base;
}
