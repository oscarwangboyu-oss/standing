/**
 * "The open": the one moment of motion in the product. The price starts at the issue price
 * and replays its history while the chart line draws from left to right.
 * Pure timing and interpolation live here. The hook that runs the frame loop is useOpen.
 */
import { ISSUE_PRICE } from '../format';
import { valueAt, xByIndex } from '../charts/scale';

export const OPEN_DELAY_MS = 250;
export const OPEN_DURATION_MS = 1600;
/**
 * A history does not always start at exactly 100.00. Over this first share of the draw
 * the figure moves from the issue price onto the line, then follows the tip exactly.
 */
export const OPEN_LEAD = 0.15;

/** Cubic ease-out. */
export function easeOut(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return 1 - Math.pow(1 - c, 3);
}

/** Linear progress 0 to 1 for a time since the loop started. */
export function openProgress(elapsedMs: number, delayMs = OPEN_DELAY_MS, durationMs = OPEN_DURATION_MS): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (elapsedMs - delayMs) / durationMs));
}

/**
 * The figure to show when the line has been drawn up to `drawn` (0 to 1 of the plot width).
 * With two or more records it is the value at the tip of the line. With one record there is
 * no line, so it runs straight from the issue price to the price.
 */
export function openValue(values: readonly number[], drawn: number, xs?: readonly number[]): number {
  const n = values.length;
  if (n === 0) return ISSUE_PRICE;
  const last = values[n - 1] as number;
  if (drawn >= 1) return last;
  if (n === 1) return ISSUE_PRICE + (last - ISSUE_PRICE) * Math.max(0, drawn);
  const at = valueAt(xs && xs.length === n ? xs : xByIndex(n), values, Math.max(0, drawn));
  const offset = ISSUE_PRICE - (values[0] as number);
  const lead = offset === 0 ? 0 : offset * Math.max(0, 1 - drawn / OPEN_LEAD);
  return at + lead;
}

/** Share of the line still hidden on the right, in percent, for the clip-path inset. */
export function openClipRight(drawn: number): number {
  return Math.round((1 - Math.min(1, Math.max(0, drawn))) * 10000) / 100;
}
