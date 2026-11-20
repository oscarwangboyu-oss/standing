// The route guards and the frame defaults. Pure functions.

import { describe, expect, it } from 'vitest';
import { NAV_IDS, ROUTES, guard, inviteRoute, navPlaceFor, resultRoute, routeKind, shellDefaultsFor, type Standing } from '@/client/nav';

const unknown: Standing = { known: false, hasCompleted: false, hasOpenCheck: false };
const fresh: Standing = { known: true, hasCompleted: false, hasOpenCheck: false };
const midCheck: Standing = { known: true, hasCompleted: false, hasOpenCheck: true };
const returning: Standing = { known: true, hasCompleted: true, hasOpenCheck: false };
const retaking: Standing = { known: true, hasCompleted: true, hasOpenCheck: true };

const APP_SCREENS = [ROUTES.market, ROUTES.open, ROUTES.log, ROUTES.payday, ROUTES.win, ROUTES.people, ROUTES.compare, ROUTES.result];
const FREE_SCREENS = [ROUTES.settings, ROUTES.team, inviteRoute('abc123'), ROUTES.about, ROUTES.method, ROUTES.privacy, ROUTES.terms];

describe('routes', () => {
  it('names every route of the app', () => {
    expect(ROUTES).toMatchObject({
      landing: '/',
      start: '/start',
      check: '/check',
      result: '/result',
      market: '/market',
      open: '/open',
      log: '/log',
      payday: '/log/payday',
      win: '/log/win',
      people: '/log/people',
      compare: '/compare',
      settings: '/settings',
      team: '/team',
      about: '/about',
      method: '/method',
      privacy: '/privacy',
      terms: '/terms',
    });
    expect(resultRoute()).toBe('/result');
    expect(resultRoute('abc_DEF-123')).toBe('/result?session=abc_DEF-123');
    expect(inviteRoute('a b')).toBe('/i/a%20b');
    expect(NAV_IDS).toEqual(['market', 'open', 'log', 'settings']);
  });

  it('sorts routes into kinds', () => {
    expect(routeKind('/')).toBe('entry');
    expect(routeKind('/start')).toBe('entry');
    expect(routeKind('/start/')).toBe('entry');
    expect(routeKind('/check')).toBe('check');
    for (const path of APP_SCREENS) expect(routeKind(path), path).toBe('app');
    expect(routeKind('/result?session=x')).toBe('app');
    for (const path of FREE_SCREENS) expect(routeKind(path), path).toBe('free');
    // A longer name that only starts like a route is not that route.
    expect(routeKind('/marketing')).toBe('free');
    expect(routeKind('/logs')).toBe('free');
  });
});

describe('guard', () => {
  it('does nothing until it is known where the person stands', () => {
    for (const path of ['/', '/start', '/check', ...APP_SCREENS, ...FREE_SCREENS]) expect(guard(path, '', unknown), path).toBeNull();
  });

  it('sends a person with a completed check from / and /start to /market', () => {
    expect(guard('/', '', returning)).toBe('/market');
    expect(guard('/start', '', returning)).toBe('/market');
    expect(guard('/start', null, returning)).toBe('/market');
  });

  it('lets a person with a completed check start another one at /start?retake=1', () => {
    expect(guard('/start', 'retake=1', returning)).toBeNull();
    expect(guard('/start', '?retake=1', returning)).toBeNull();
    expect(guard('/start', new URLSearchParams({ retake: '1' }), returning)).toBeNull();
    expect(guard('/start', 'retake=0', returning)).toBe('/market');
  });

  it('sends a person without a completed check from every app screen to /start', () => {
    for (const path of APP_SCREENS) expect(guard(path, '', fresh), path).toBe('/start');
    expect(guard('/', '', fresh)).toBeNull();
    expect(guard('/start', '', fresh)).toBeNull();
  });

  it('resumes an unfinished check at /check', () => {
    expect(guard('/start', '', midCheck)).toBe('/check');
    for (const path of APP_SCREENS) expect(guard(path, '', midCheck), path).toBe('/check');
    expect(guard('/check', '', midCheck)).toBeNull();
    // The front door never traps a person in the check.
    expect(guard('/', '', midCheck)).toBeNull();
  });

  it('keeps a person who retakes on the screens they already have, and resumes from /start', () => {
    for (const path of APP_SCREENS) expect(guard(path, '', retaking), path).toBeNull();
    expect(guard('/check', '', retaking)).toBeNull();
    expect(guard('/start', '', retaking)).toBe('/check');
    expect(guard('/start', 'retake=1', retaking)).toBe('/check');
    expect(guard('/', '', retaking)).toBe('/market');
  });

  it('leads /check without an unfinished check to the result, or to /start without one', () => {
    expect(guard('/check', '', returning)).toBe('/result');
    expect(guard('/check', '', fresh)).toBe('/start');
  });

  it('leaves settings, the team dashboard, an invite and the public pages to everyone', () => {
    for (const standing of [fresh, midCheck, returning, retaking]) {
      for (const path of FREE_SCREENS) expect(guard(path, '', standing), path).toBeNull();
    }
  });

  it('never sends a person to the route they are on', () => {
    for (const standing of [fresh, midCheck, returning, retaking]) {
      for (const path of ['/', '/start', '/check', ...APP_SCREENS, ...FREE_SCREENS]) {
        const target = guard(path, '', standing);
        expect(target, path).not.toBe(path);
        // And the place it sends them to lets them stay.
        if (target) expect(guard(target, '', standing), `${path} -> ${target}`).toBeNull();
      }
    }
  });
});

describe('the frame of a route', () => {
  it('marks the current place of the bottom navigation', () => {
    expect(navPlaceFor('/market')).toBe('market');
    expect(navPlaceFor('/open')).toBe('open');
    expect(navPlaceFor('/log')).toBe('log');
    expect(navPlaceFor('/log/payday')).toBe('log');
    expect(navPlaceFor('/settings')).toBe('settings');
    expect(navPlaceFor('/compare')).toBeNull();
    expect(navPlaceFor('/check')).toBeNull();
  });

  it('shows the navigation on the four places and compare, and not on the check, the result, start, an invite or the team dashboard', () => {
    expect(shellDefaultsFor('/market').nav).toBe('market');
    expect(shellDefaultsFor('/log/win').nav).toBe('log');
    expect(shellDefaultsFor('/settings')).toMatchObject({ nav: 'settings', footer: true });
    // Compare is reached from the market's entries, so the navigation marks Market.
    expect(shellDefaultsFor('/compare')).toMatchObject({ nav: 'market', width: 'wide' });
    expect(shellDefaultsFor('/check')).toMatchObject({ nav: undefined, fill: true });
    expect(shellDefaultsFor('/result').nav).toBeUndefined();
    expect(shellDefaultsFor('/start').nav).toBeUndefined();
    expect(shellDefaultsFor('/i/abc').nav).toBeUndefined();
    expect(shellDefaultsFor('/team')).toMatchObject({ nav: undefined, width: 'wide' });
  });
});
