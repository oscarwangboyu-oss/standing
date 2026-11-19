/**
 * Number formatting for prices and changes. Pure functions, no DOM.
 * Every price is shown with two decimals. A loss uses the true minus sign (U+2212).
 */

export const MINUS = '−';

/** The issue price. Every sector and the overall price start here. */
export const ISSUE_PRICE = 100;
/** The position track covers two standard deviations each way. */
export const POSITION_MIN = 70;
export const POSITION_MAX = 130;
/** The lowest and the highest price a sector can show. */
export const PRICE_MIN = 55;
export const PRICE_MAX = 145;

export type Direction = 'up' | 'down' | 'flat';

/** Round half away from zero to two decimals, without the binary noise of toFixed on values such as 1.005. */
export function round2(value: number): number {
  const a = Math.abs(value);
  const r = Math.round(a * (1 + Number.EPSILON) * 100) / 100;
  return value < 0 && r !== 0 ? -r : r;
}

/** "104.37". Always two decimals. */
export function formatPrice(value: number): string {
  return round2(value).toFixed(2);
}

/** Direction after rounding, so that a change of 0.004 reads as no change. */
export function direction(value: number): Direction {
  const r = round2(value);
  if (r > 0) return 'up';
  if (r < 0) return 'down';
  return 'flat';
}

/** "+1.12", "−0.75", "0.00". */
export function formatChange(value: number): string {
  const r = round2(value);
  if (r > 0) return `+${r.toFixed(2)}`;
  if (r < 0) return `${MINUS}${Math.abs(r).toFixed(2)}`;
  return '0.00';
}

/** "+1.08%", "−0.77%", "0.00%". The argument is already in percent. */
export function formatPercent(pct: number): string {
  return `${formatChange(pct)}%`;
}

/** Change in percent of the previous price. null when there is no usable previous price. */
export function percentChange(now: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((now - previous) / previous) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A price clamped to the position track, 70 to 130. */
export function clampPosition(value: number): number {
  return clamp(value, POSITION_MIN, POSITION_MAX);
}

/** Where a price sits on the 70 to 130 track, 0 to 1. 100 is 0.5. */
export function positionFraction(value: number): number {
  return (clampPosition(value) - POSITION_MIN) / (POSITION_MAX - POSITION_MIN);
}

/** The bar runs from the issue price to the price. Both numbers are fractions of the track. */
export function positionBar(value: number): { left: number; width: number } {
  const p = positionFraction(value);
  return { left: Math.min(0.5, p), width: Math.abs(p - 0.5) };
}

/** Where a price sits on the full 55 to 145 scale, 0 to 1. */
export function rulerFraction(value: number): number {
  return (clamp(value, PRICE_MIN, PRICE_MAX) - PRICE_MIN) / (PRICE_MAX - PRICE_MIN);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * "2026-10-01" to "Oct 1". Days are YYYY-MM-DD text everywhere in the product, so this
 * reads the text and never builds a Date: the result cannot shift with a time zone.
 * Anything that is not a day is returned unchanged.
 */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return day;
  return `${month} ${Number(m[3])}`;
}

/** Days between two YYYY-MM-DD days (b minus a), counted on the calendar in UTC. */
export function daysBetween(a: string, b: string): number {
  const parse = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((parse(b) - parse(a)) / 86400000);
}
