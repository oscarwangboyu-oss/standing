'use client';

/**
 * What this device remembers about its own Daily Opens: the days it recorded and the three
 * taps of each. GET /api/me says how long the streak is, not which of the last seven days have
 * a record, so the seven windows of the streak are drawn from this log where it knows the day
 * (see streakWeek in src/ui/market/live.ts). The taps let the screen show what was recorded
 * today. Nothing here is sent anywhere: the server already has the taps.
 */
import { useSyncExternalStore } from 'react';
import { createSlot, device, deviceStorage, type Slot } from '@/client/device';

export interface DailyTaps {
  /** The day the taps describe, YYYY-MM-DD. */
  day: string;
  sleep: number | null;
  exercise: number | null;
  state: number | null;
}

export interface DailyLog {
  /** The record the log belongs to. A log of another person on this device is ignored. */
  userId: string | null;
  /** Oldest first, one per day, the last KEEP days. */
  entries: DailyTaps[];
}

const KEEP = 60;
const EMPTY: DailyLog = Object.freeze({ userId: null, entries: [] as DailyTaps[] });

const tap = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4 ? value : null);

function revive(value: unknown): DailyLog | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { userId?: unknown; entries?: unknown };
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && typeof (e as { day?: unknown }).day === 'string')
        .map((e) => ({ day: e.day as string, sleep: tap(e.sleep), exercise: tap(e.exercise), state: tap(e.state) }))
    : [];
  return { userId: typeof raw.userId === 'string' ? raw.userId : null, entries };
}

let slot: Slot<DailyLog> | null = null;

function dailySlot(): Slot<DailyLog> {
  if (!slot) slot = createSlot<DailyLog>({ storage: deviceStorage(), name: 'daily-log', version: 1, empty: EMPTY, revive });
  return slot;
}

/** Keeps the taps of one recorded day. A day already in the log is left as it is: the first record stands. */
export function rememberDaily(taps: DailyTaps): void {
  const userId = device().get().userId;
  dailySlot().update((log) => {
    const mine = log.userId === userId ? log.entries : [];
    if (mine.some((e) => e.day === taps.day)) return log.userId === userId ? log : { userId, entries: mine };
    const entries = [...mine, taps].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-KEEP);
    return { userId, entries };
  });
}

export interface DailyLogView {
  /** The taps of a day this device recorded, or null. */
  tapsOf(day: string): DailyTaps | null;
  /** For streakWeek: the recorded days and the first day this device recorded. */
  known: { days: ReadonlySet<string>; since: string | null };
}

const viewOf = (log: DailyLog, userId: string | null): DailyLogView => {
  const entries = log.userId !== null && log.userId === userId ? log.entries : [];
  const days = new Set(entries.map((e) => e.day));
  return {
    tapsOf: (day) => entries.find((e) => e.day === day) ?? null,
    known: { days, since: entries[0]?.day ?? null },
  };
};

/** The log of the person on this device, re-rendering when it changes. */
export function useDailyLog(userId: string | null): DailyLogView {
  const s = dailySlot();
  const log = useSyncExternalStore(s.subscribe, s.get, () => EMPTY);
  return viewOf(log, userId);
}
