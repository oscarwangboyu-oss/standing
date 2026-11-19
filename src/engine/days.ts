// Calendar days as YYYY-MM-DD text. The engine never reads a clock: the caller supplies every
// day, and the arithmetic here is done on the text alone (proleptic Gregorian calendar, no
// time zones).

import { EngineError } from './types';

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function civilToNumber(year: number, month: number, dayOfMonth: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + dayOfMonth - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** The day a number of days after 1970-01-01. */
export function dayOf(dayNumberValue: number): string {
  if (!Number.isInteger(dayNumberValue)) throw new EngineError('a day number is a whole number');
  const z = dayNumberValue + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const dayOfMonth = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(dayOfMonth, 2)}`;
}

/** Days from 1970-01-01 to `day`. Refuses anything that is not a real calendar day in YYYY-MM-DD. */
export function dayNumber(day: string): number {
  const match = typeof day === 'string' ? DAY_PATTERN.exec(day) : null;
  if (!match) throw new EngineError(`"${String(day)}" is not a day in YYYY-MM-DD`);
  const n = civilToNumber(Number(match[1]), Number(match[2]), Number(match[3]));
  // 2026-02-30 and 2026-13-01 match the pattern and are not days.
  if (dayOf(n) !== day) throw new EngineError(`"${day}" is not a calendar day`);
  return n;
}

/** True for a real calendar day in YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

/** The day `count` days after `day` (before it when count is negative). */
export function addDays(day: string, count: number): string {
  return dayOf(dayNumber(day) + count);
}

/** Days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/**
 * Calendar week of a day number, counted in whole weeks that start on Monday. Two days share
 * a week exactly when they share this number. (1970-01-05 was a Monday.)
 */
export function weekOf(dayNumberValue: number): number {
  return Math.floor((dayNumberValue + 3) / 7);
}
