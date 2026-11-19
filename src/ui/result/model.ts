/**
 * What the result screen shows, derived from the engine's result, the history of GET /api/me
 * and the live block. Pure: no React, no storage, no clock.
 *
 * Internal 0 to 1 values never leave this file: everything it returns is a price, a change in
 * points, a status or a tag.
 */
import {
  ALGO_PARAMS,
  AREA_IDS,
  CURRENT,
  addDays,
  getBank,
  marketOf,
  type AreaId,
  type Market,
  type Result,
  type RoleId,
  type TimelineMarker,
  type VersionSet,
} from '@/engine';
import type { HistoryPoint, MeLive } from '@/shared/api';
import { roleNames } from '@/copy/market';
import { head, history as historyCopy } from '@/copy/result';
import { typeForPair } from '@/copy/types';
import { AREA_CODE, SECTOR_CODES, type SectorCode, type SectorTagKind } from '../sectors';
import { percentChange, round2 } from '../format';
import type { ChartPoint } from '../charts/PriceChart';
import type { ShareCardData } from '../share/layout';
import type { TowerStatus } from '../skyline/Skyline';

export const CODE_AREA = { SKIL: 'C', WLTH: 'W', NETW: 'N', BODY: 'B', MIND: 'M' } as const satisfies Record<SectorCode, AreaId>;

export type Prices = Record<SectorCode, number | null>;

/** The parameters of the algorithm a result was computed with, or of the current one. */
export function paramsOf(versions: VersionSet | null | undefined) {
  const algo = versions?.algo ?? CURRENT.algo;
  return ALGO_PARAMS[algo] ?? ALGO_PARAMS[CURRENT.algo];
}

export function pricesOf(result: Result): Prices {
  const out = {} as Prices;
  for (const code of SECTOR_CODES) out[code] = result.sectors[CODE_AREA[code]].price;
  return out;
}

export function pricesOfPoint(sectors: Record<AreaId, number | null>): Prices {
  const out = {} as Prices;
  for (const code of SECTOR_CODES) out[code] = sectors[CODE_AREA[code]];
  return out;
}

/**
 * "Ages 21 to 24, employed full-time": the bank's age band and the short name of the situation,
 * the same line the market home shows. null while age or role is unknown.
 */
export function cohortOf(age: number | null | undefined, role: RoleId | null | undefined): string | null {
  if (age === null || age === undefined || !role) return null;
  const bank = getBank();
  const ageLabel = bank.ages[age]?.en;
  const roleLabel: string | undefined = roleNames[role];
  if (!ageLabel || !roleLabel) return null;
  return head.cohort(ageLabel, roleLabel);
}

/** The record before the one on screen. null for the first record. */
export function previousOf(history: readonly HistoryPoint[], sessionId: string): HistoryPoint | null {
  const index = history.findIndex((h) => h.sessionId === sessionId);
  if (index === -1) return history[history.length - 1] ?? null;
  return index > 0 ? (history[index - 1] as HistoryPoint) : null;
}

/** The history up to and including the record on screen. The record is added when the server has not listed it yet. */
export function historyUpTo(history: readonly HistoryPoint[], sessionId: string, result: Result, at: string): HistoryPoint[] {
  const index = history.findIndex((h) => h.sessionId === sessionId);
  if (index !== -1) return history.slice(0, index + 1);
  const sectors = {} as Record<AreaId, number | null>;
  for (const area of AREA_IDS) sectors[area] = result.sectors[area].price;
  return [...history, { sessionId, at, overall: result.overall, sectors, grade: result.grade, versions: result.versions }];
}

export interface OverallMove {
  value: number;
  pct: number | null;
}

export function overallMove(result: Result, previous: HistoryPoint | null): OverallMove | null {
  if (!previous || previous.overall === null || result.overall === null) return null;
  return { value: result.overall - previous.overall, pct: percentChange(result.overall, previous.overall) };
}

export function sectorMoves(result: Result, previous: HistoryPoint | null): Record<SectorCode, number | null> {
  const out = {} as Record<SectorCode, number | null>;
  for (const code of SECTOR_CODES) {
    const now = result.sectors[CODE_AREA[code]].price;
    const before = previous ? previous.sectors[CODE_AREA[code]] : null;
    out[code] = now !== null && before !== null ? now - before : null;
  }
  return out;
}

/**
 * The market data to comment on. The engine's own, unless the mind notice comes from the daily
 * records (then mind must not be the laggard) or the stored result was computed without the
 * previous record.
 */
export function marketFor(result: Result, previous: HistoryPoint | null, notice: boolean): Market {
  const stale = notice !== result.mindNotice || (result.market.change === null && previous !== null);
  if (!stale) return result.market;
  const prices: Partial<Record<AreaId, number | null>> = {};
  for (const area of AREA_IDS) prices[area] = result.sectors[area].price;
  return marketOf({ prices, mindAlert: notice, previous: previous?.sectors ?? null, algo: result.versions.algo });
}

export interface StatsView {
  high: number | null;
  low: number | null;
}

/** Highest and lowest overall price up to the record on screen. With live data, the daily series counts too. */
export function statsOf(upTo: readonly HistoryPoint[], live: MeLive | null): StatsView {
  const values = upTo.map((h) => h.overall).filter((v): v is number => v !== null);
  if (live) {
    if (live.allTime.high !== null) values.push(live.allTime.high);
    if (live.allTime.low !== null) values.push(live.allTime.low);
  }
  if (values.length === 0) return { high: null, low: null };
  return { high: Math.max(...values), low: Math.min(...values) };
}

function versionLabel(from: VersionSet, to: VersionSet): string | null {
  if (from.algo !== to.algo) return historyCopy.version.algo(String(to.algo));
  if (from.bank !== to.bank) return historyCopy.version.bank(to.bank);
  if (from.norm !== to.norm) return historyCopy.version.norm(to.norm);
  return null;
}

export interface ChartView {
  points: ChartPoint[];
  spacing: 'index' | 'day';
}

/**
 * The chart. With live data: one point per day since the first check, a ring on the days of a
 * full check and a line on the day a version changed. Without: one point per check.
 */
export function chartOf(upTo: readonly HistoryPoint[], live: MeLive | null): ChartView {
  if (live && live.series.length >= 2) {
    const full = new Set<string>();
    const versions = new Map<string, string>();
    for (const marker of live.markers as TimelineMarker[]) {
      if (marker.kind === 'full_check') full.add(marker.day);
      else {
        const label = versionLabel(marker.from, marker.to);
        if (label) versions.set(marker.day, label);
      }
    }
    const points: ChartPoint[] = [];
    for (let i = 0; i < live.series.length; i += 1) {
      const value = live.series.overall[i];
      if (value === null || value === undefined) continue;
      const date = addDays(live.series.start, i);
      const point: ChartPoint = { date, value };
      if (full.has(date)) point.full = true;
      const version = versions.get(date);
      if (version) point.version = version;
      points.push(point);
    }
    if (points.length >= 2) return { points, spacing: 'day' };
  }
  const points: ChartPoint[] = [];
  let before: HistoryPoint | null = null;
  for (const record of upTo) {
    if (record.overall !== null) {
      const point: ChartPoint = { date: record.at.slice(0, 10), value: record.overall };
      const label = before ? versionLabel(before.versions, record.versions) : null;
      if (label) point.version = label;
      points.push(point);
    }
    before = record;
  }
  return { points, spacing: 'index' };
}

export interface SectorView {
  code: SectorCode;
  area: AreaId;
  status: TowerStatus;
  price: number | null;
  change: number | null;
  tag: SectorTagKind | null;
  /** The sector's price at each check, oldest first. */
  history: number[];
  haltedSince: string | null;
}

export function sectorViews(args: {
  result: Result;
  market: Market;
  previous: HistoryPoint | null;
  upTo: readonly HistoryPoint[];
  /** The live block, only when the record on screen is the latest one. */
  live: MeLive | null;
}): SectorView[] {
  const moves = sectorMoves(args.result, args.previous);
  return SECTOR_CODES.map((code) => {
    const area = CODE_AREA[code];
    const sector = args.result.sectors[area];
    const liveSector = args.live?.sectors[area] ?? null;
    const halted = sector.price !== null && liveSector?.status === 'halted';
    return {
      code,
      area,
      status: halted ? 'halted' : sector.status,
      price: sector.price,
      change: moves[code],
      tag: args.market.tags[area],
      history: args.upTo.map((h) => h.sectors[area]).filter((v): v is number => v !== null),
      haltedSince: halted ? (liveSector?.haltedSince ?? null) : null,
    };
  });
}

export function towerStatuses(views: readonly SectorView[]): Record<SectorCode, TowerStatus> {
  const out = {} as Record<SectorCode, TowerStatus>;
  for (const view of views) out[view.code] = view.status;
  return out;
}

/** The two highest sectors as ticker codes. null when the sectors are level or fewer than two are priced. */
export function pairOf(type: readonly [AreaId, AreaId] | null): [SectorCode, SectorCode] | null {
  return type ? [AREA_CODE[type[0]], AREA_CODE[type[1]]] : null;
}

/** What the share image holds: ticker, overall price, five sector prices, type name. Nothing else. */
export function shareDataOf(result: Result, ticker: string | null): ShareCardData | null {
  if (result.overall === null) return null;
  const pair = pairOf(result.type);
  return {
    ticker: ticker ?? head.noTicker,
    price: round2(result.overall),
    sectors: SECTOR_CODES.map((code) => ({ code, price: result.sectors[CODE_AREA[code]].price })),
    type: pair ? (typeForPair(pair[0], pair[1])?.name ?? null) : null,
  };
}

/** A whole number of rungs reads "2", a half reads "1.5". */
export function rungsText(value: number): string {
  const abs = Math.abs(value);
  return Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
}
