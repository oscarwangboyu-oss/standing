// Day arithmetic on YYYY-MM-DD text. The engine reads no clock, so every rule that counts days
// (windows, halts, streaks, weeks) rests on these.

import { describe, expect, it } from 'vitest';
import { EngineError, addDays, dayNumber, dayOf, daysBetween, isDay, weekOf } from '../../../src/engine';

describe('days', () => {
  it('counts from 1970-01-01 and back again', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2000-03-01')).toBe(11017);
    expect(dayOf(11017)).toBe('2000-03-01');
    for (const day of ['2024-02-29', '2025-12-31', '2026-01-01', '2026-11-19', '2100-02-28']) {
      expect(dayOf(dayNumber(day))).toBe(day);
    }
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2026-03-10', '2026-03-01')).toBe(-9);
  });

  it('refuses what is not a calendar day', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-5', '20260105', '', '2026-01-05T00:00:00Z']) {
      expect(isDay(bad), bad).toBe(false);
      expect(() => dayNumber(bad), bad).toThrow(EngineError);
    }
    expect(isDay('2026-01-05')).toBe(true);
    expect(isDay(20260105)).toBe(false);
  });

  it('weeks start on Monday', () => {
    // 2026-11-16 is a Monday and 2026-11-22 the Sunday after it.
    const week = weekOf(dayNumber('2026-11-16'));
    for (let i = 0; i < 7; i++) expect(weekOf(dayNumber(addDays('2026-11-16', i)))).toBe(week);
    expect(weekOf(dayNumber('2026-11-15'))).toBe(week - 1);
    expect(weekOf(dayNumber('2026-11-23'))).toBe(week + 1);
  });
});
