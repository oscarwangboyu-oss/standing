/**
 * Reads the `live` block of GET /api/me for the market home, the micro apps and the log.
 * Pure functions: no React, no storage, no clock. Days are YYYY-MM-DD text throughout.
 */
import { addDays, daysBetween, marketOf, type AreaId, type PayFrequency, type Streak } from '@/engine';
import type { DayBreakdownResponse, LiveApp, LiveSector, MeLive } from '@/shared/api';
import type { ChartPoint } from '../charts/PriceChart';
import { round2 } from '../format';
import { AREA_CODE, SECTOR_CODES, type SectorCode, type SectorTagKind } from '../sectors';
import type { TowerStatus } from '../skyline/Skyline';
import type { StreakDay } from '../Streak';

/** The engine's sector ids in display order: SKIL, WLTH, NETW, BODY, MIND. */
export const AREAS = ['C', 'W', 'N', 'B', 'M'] as const satisfies readonly AreaId[];

const AREA_OF = { SKIL: 'C', WLTH: 'W', NETW: 'N', BODY: 'B', MIND: 'M' } as const satisfies Record<SectorCode, AreaId>;

export function areaOf(code: SectorCode): AreaId {
  return AREA_OF[code];
}

export function codeOf(area: AreaId): SectorCode {
  return AREA_CODE[area];
}

function bySector<T>(read: (area: AreaId, code: SectorCode) => T): Record<SectorCode, T> {
  return Object.fromEntries(SECTOR_CODES.map((code) => [code, read(AREA_OF[code], code)])) as Record<SectorCode, T>;
}

/** The five shown prices. null where a sector has none. */
export function livePrices(live: MeLive): Record<SectorCode, number | null> {
  return bySector((area) => live.sectors[area].price);
}

/** How each lot of the skyline is drawn. */
export function liveStatus(live: MeLive): Record<SectorCode, TowerStatus> {
  return bySector((area) => live.sectors[area].status);
}

/** The micro app that keeps each sector fresh. */
const APP_OF = { C: 'weeklyWin', W: 'payday', N: 'peopleNudge', B: 'dailyOpen', M: 'dailyOpen' } as const satisfies Record<
  AreaId,
  keyof MeLive['apps']
>;

/**
 * Which towers have their lights on: sectors updated today. A full check today lights all of
 * them. A sector without a price or a halted one stays dark.
 */
export function litToday(live: MeLive): Record<SectorCode, boolean> {
  const checkedToday = live.lastCheckDay === live.today;
  return bySector((area) => {
    const sector = live.sectors[area];
    if (sector.status !== 'listed') return false;
    return checkedToday || live.apps[APP_OF[area]].recordedToday;
  });
}

/** The last day the app behind a sector has a record. null when it was never used. */
export function lastRecordOf(live: MeLive, area: AreaId): string | null {
  return live.apps[APP_OF[area]].lastDay;
}

/** Whole days since the app behind a sector last had a record. null when it was never used. */
export function daysWithoutRecord(live: MeLive, area: AreaId): number | null {
  const last = lastRecordOf(live, area);
  return last === null ? null : Math.max(0, daysBetween(last, live.today));
}

/** The last `count` shown prices of a sector, oldest first, for a sparkline. */
export function recentPrices(live: MeLive, area: AreaId, count = 14): number[] {
  const all = live.series.sectors[area].filter((v): v is number => v !== null);
  return all.slice(-count);
}

/** The overall price by day with the markers of the chart. Days without a price are left out. */
export function overallPoints(live: MeLive, versionLabel: (algo: number | null) => string): ChartPoint[] {
  const full = new Set<string>();
  const version = new Map<string, string>();
  for (const marker of live.markers) {
    if (marker.kind === 'full_check') full.add(marker.day);
    else version.set(marker.day, versionLabel(marker.from.algo !== marker.to.algo ? marker.to.algo : null));
  }
  const points: ChartPoint[] = [];
  live.series.overall.forEach((value, i) => {
    if (value === null) return;
    const date = addDays(live.series.start, i);
    points.push({ date, value, full: full.has(date) || undefined, version: version.get(date) });
  });
  return points;
}

/** True when a shown price trails what today's data gives by a visible amount. */
export function isCatchingUp(sector: { price: number | null; target: number | null }): boolean {
  return sector.price !== null && sector.target !== null && round2(sector.target - sector.price) !== 0;
}

/**
 * The one tag of a sector row. Resumed comes first: it is true for one day. Otherwise the
 * engine's own tags over today's prices: leader, laggard (never Mind while the mind notice is
 * shown), limit up and limit down. A halted row is tagged by the row itself.
 */
export function liveTags(live: MeLive): Record<SectorCode, SectorTagKind | null> {
  const prices: Partial<Record<AreaId, number | null>> = {};
  for (const area of AREAS) {
    const s = live.sectors[area];
    prices[area] = s.status === 'listed' || s.status === 'halted' ? s.price : null;
  }
  const tags = marketOf({ prices, mindAlert: live.mindNotice }).tags;
  return bySector((area) => {
    const sector = live.sectors[area];
    if (sector.status === 'halted') return null;
    if (sector.resumed) return 'resumed';
    return tags[area] ?? null;
  });
}

export interface MoveDay {
  day: string;
  /** The shown overall price at the end of the day. */
  price: number;
  /** Points against the day before. */
  change: number;
  fullCheck: boolean;
  versionChange: boolean;
}

/** Days on which the shown overall price moved, newest first. */
export function moveDays(live: MeLive, max = 14): MoveDay[] {
  const full = new Set(live.markers.filter((m) => m.kind === 'full_check').map((m) => m.day));
  const version = new Set(live.markers.filter((m) => m.kind === 'version_change').map((m) => m.day));
  const out: MoveDay[] = [];
  const series = live.series.overall;
  for (let i = series.length - 1; i >= 1 && out.length < max; i -= 1) {
    const now = series[i];
    const before = series[i - 1];
    if (now === null || now === undefined || before === null || before === undefined) continue;
    const change = round2(now - before);
    if (change === 0) continue;
    const day = addDays(live.series.start, i);
    out.push({ day, price: now, change, fullCheck: full.has(day), versionChange: version.has(day) });
  }
  return out;
}

/** Sectors whose shown price moved between the two days of a breakdown while the data gave the same target. */
export function caughtUp(data: DayBreakdownResponse | null): Set<AreaId> {
  const out = new Set<AreaId>();
  if (!data?.prices) return out;
  for (const area of AREAS) {
    const from = data.prices.from.sectors[area];
    const to = data.prices.to.sectors[area];
    if (from.price === null || to.price === null || from.target === null || to.target === null) continue;
    if (round2(to.price - from.price) !== 0 && round2(to.target - from.target) === 0) out.add(area);
  }
  return out;
}

/**
 * The last seven days of the Daily Open, oldest first, for the Streak windows.
 *
 * The server says four things for certain: whether today is recorded, which earlier days are
 * still open (canBackfill), the last recorded day, and the day of the first full check
 * (firstDay). A day before the first check is `before`: the person had no price yet, so it
 * is not a missed day. `known` adds the days this device recorded itself. For a day before
 * this device started recording, the run is read as unbroken: `current` days ending on the
 * last recorded day. That can light one window too many when the run has a single missed day
 * in it, on a device that did not record it.
 */
export function streakWeek(
  streak: Streak & { firstDay?: string },
  today: string,
  weekdays: readonly string[],
  known: { days: ReadonlySet<string>; since: string | null } = { days: new Set(), since: null },
): StreakDay[] {
  const first = streak.firstDay ?? null;
  const open = new Set(openDays(streak));
  const runStart = streak.lastDay !== null && streak.current > 0 ? addDays(streak.lastDay, -(streak.current - 1)) : null;
  const week: StreakDay[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const day = addDays(today, -back);
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const label = weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
    let recorded: boolean;
    if (back === 0) recorded = streak.recordedToday;
    else if (known.days.has(day) || day === streak.lastDay) recorded = true;
    else if (open.has(day)) recorded = false;
    else if (known.since !== null && day >= known.since) recorded = false;
    else recorded = runStart !== null && streak.lastDay !== null && day >= runStart && day <= streak.lastDay;
    // A day the run covers stays lit even before the first check (a record sent by an older screen).
    if (!recorded && back > 0 && first !== null && day < first) week.push({ label, recorded: false, before: true });
    else week.push({ label, recorded });
  }
  return week;
}

/**
 * The days before today that the screen offers to fill in: the server's canBackfill without
 * any day before the first full check. The server leaves those out already; an older answer
 * of /api/me may still carry them.
 */
export function openDays(streak: Streak & { firstDay?: string }): string[] {
  const first = streak.firstDay ?? null;
  return first === null ? [...streak.canBackfill] : streak.canBackfill.filter((day) => day >= first);
}

/** Progress toward a counting rule, when the server sends it: `have` of the last `of` periods have a record, `need` are needed. */
export interface CountWindow {
  have: number;
  need: number;
  of: number;
}

/**
 * The counting window of a micro app: LiveApp.window as the server sends it. null for Payday
 * Check, which has none, and for an answer that cannot be drawn (an older server without the
 * field, or numbers out of shape); the screens then state the rule only.
 */
export function countWindow(app: Omit<LiveApp, 'window'> & { window?: LiveApp['window'] }): CountWindow | null {
  const w = app.window as Partial<Record<keyof CountWindow, unknown>> | null | undefined;
  if (!w || typeof w.have !== 'number' || typeof w.need !== 'number' || typeof w.of !== 'number') return null;
  if (!Number.isInteger(w.have) || !Number.isInteger(w.need) || !Number.isInteger(w.of)) return null;
  if (!(w.need > 0) || !(w.of >= w.need) || w.have < 0 || w.have > w.of) return null;
  return { have: w.have, need: w.need, of: w.of };
}

/** Days from one payday to the next, to say when the next one is due. Twice a month and monthly are rounded. */
export const PAY_PERIOD_DAYS: Record<PayFrequency, number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 };

/** Around when the payday after `last` falls. */
export function nextPayday(last: string, frequency: PayFrequency): string {
  return addDays(last, PAY_PERIOD_DAYS[frequency]);
}

/** The Monday on which the next calendar week starts. Weeks start on Monday, as in the engine. */
export function nextMonday(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 is Sunday
  const ahead = weekday === 0 ? 1 : 8 - weekday;
  return addDays(today, ahead);
}

export type { LiveSector };
