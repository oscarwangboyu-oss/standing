/**
 * Chart math. Plain functions with no DOM, so they can be tested directly.
 * Every chart keeps the issue price, 100, in view: it is the reference the product is read against.
 */
import { ISSUE_PRICE, POSITION_MAX, POSITION_MIN, clamp } from '../format';

export interface Domain {
  min: number;
  max: number;
}

export interface PriceDomain extends Domain {
  /** Labelled values, ascending. 100 is always one of them. */
  ticks: number[];
  step: number;
}

/** Trim a coordinate to at most two decimals: 147.5, 93.75, 65.75, 220. */
export function coord(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

const STEPS = [1, 2, 5, 10, 20, 25, 50] as const;
/** Share of one step left empty above the top tick, so the top label is not cut by the edge. */
const HEADROOM = 0.4;
const MAX_INTERVALS = 3;

/**
 * The y-domain of a price chart: the smallest round step that covers the data and 100
 * in at most three intervals. For the sample history (98.20 to 104.37) this gives
 * ticks 95, 100, 105 and a domain of 95 to 107.
 */
export function priceDomain(values: readonly number[]): PriceDomain {
  const finite = values.filter((v) => Number.isFinite(v));
  let lo = Math.min(ISSUE_PRICE, ...finite);
  let hi = Math.max(ISSUE_PRICE, ...finite);
  if (hi - lo < 1) {
    // A flat line at or near 100 still gets a band to sit in.
    lo -= 1;
    hi += 1;
  }
  for (const step of STEPS) {
    const bottom = Math.floor(lo / step) * step;
    let top = Math.ceil(hi / step) * step;
    if (top === hi) top += 0; // the top tick may equal the highest value; headroom keeps it visible
    const intervals = Math.round((top - bottom) / step);
    if (intervals <= MAX_INTERVALS || step === STEPS[STEPS.length - 1]) {
      const ticks: number[] = [];
      for (let t = bottom; t <= top + 1e-9; t += step) ticks.push(t);
      return { min: bottom, max: top + step * HEADROOM, ticks, step };
    }
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

/** Distance from the top of the plot, 0 to 1. */
export function yFraction(value: number, domain: Domain): number {
  if (domain.max === domain.min) return 0.5;
  return (domain.max - value) / (domain.max - domain.min);
}

/** Even spacing by record: the first point at 0, the last at 1. A single point sits at the right edge. */
export function xByIndex(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}

/**
 * Spacing by calendar day, for histories with one point per day. Days are YYYY-MM-DD text.
 * Falls back to even spacing when the days do not parse or all fall on one day.
 */
export function xByDay(days: readonly string[]): number[] {
  const t = days.map((d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  });
  const first = t[0];
  const last = t[t.length - 1];
  if (t.length < 2 || first === undefined || last === undefined || t.some(Number.isNaN) || last <= first) {
    return xByIndex(days.length);
  }
  return t.map((v) => clamp((v - first) / (last - first), 0, 1));
}

/** "0,175 100,220 200,190" for a polyline in a width by height viewBox. */
export function polylinePoints(
  xs: readonly number[],
  values: readonly number[],
  domain: Domain,
  width: number,
  height: number,
): string {
  const n = Math.min(xs.length, values.length);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(`${coord((xs[i] as number) * width)},${coord(yFraction(values[i] as number, domain) * height)}`);
  }
  return parts.join(' ');
}

/**
 * The value on the line at horizontal position x (0 to 1), by linear interpolation
 * between the neighbouring points. Used by the open so the figure matches the tip of the line.
 */
export function valueAt(xs: readonly number[], values: readonly number[], x: number): number {
  const n = Math.min(xs.length, values.length);
  if (n === 0) return ISSUE_PRICE;
  if (n === 1 || x <= (xs[0] as number)) return values[0] as number;
  for (let i = 1; i < n; i++) {
    const x1 = xs[i] as number;
    if (x <= x1) {
      const x0 = xs[i - 1] as number;
      const v0 = values[i - 1] as number;
      const v1 = values[i] as number;
      return x1 === x0 ? v1 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
  }
  return values[n - 1] as number;
}

/* ---------- Sparklines ---------- */

/**
 * One y-domain for a set of sparklines, so the blue 100 line means the same thing in each row.
 * It covers every value and 100, with a small pad so strokes are not cut at the edges.
 */
export function sharedDomain(series: ReadonlyArray<readonly number[]>, pad = 0.06): Domain {
  let lo = ISSUE_PRICE;
  let hi = ISSUE_PRICE;
  for (const s of series) {
    for (const v of s) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  return { min: lo - span * pad, max: hi + span * pad };
}

/* ---------- Pentagon ---------- */

export const PENTAGON = {
  width: 360,
  height: 282,
  cx: 180,
  cy: 150,
  /** Radius of the rim, where the price is 130. The centre is 70. */
  radius: 104,
  /** Rings every 15 points. 100 is drawn in the reference colour. */
  rings: [85, 100, 115, 130],
} as const;

/** Distance from the centre for a price, in viewBox units. Prices outside 70 to 130 stop at the edge. */
export function pentagonRadius(value: number): number {
  return ((clamp(value, POSITION_MIN, POSITION_MAX) - POSITION_MIN) / (POSITION_MAX - POSITION_MIN)) * PENTAGON.radius;
}

/** The vertex for sector index 0 to 4, clockwise from the top. */
export function pentagonVertex(index: number, value: number): { x: number; y: number } {
  const angle = ((-90 + index * 72) * Math.PI) / 180;
  const r = pentagonRadius(value);
  return { x: PENTAGON.cx + r * Math.cos(angle), y: PENTAGON.cy + r * Math.sin(angle) };
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Points of the ring at one price. */
export function pentagonRing(value: number): string {
  return [0, 1, 2, 3, 4]
    .map((i) => {
      const p = pentagonVertex(i, value);
      return `${one(p.x)},${one(p.y)}`;
    })
    .join(' ');
}

/**
 * Points of the shape through the sectors that have a price, in order.
 * Sectors without a price (null) are left out, so the shape never claims a value it does not have.
 */
export function pentagonShape(values: ReadonlyArray<number | null>): { points: string; count: number } {
  const pts: string[] = [];
  values.slice(0, 5).forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const p = pentagonVertex(i, v);
    pts.push(`${one(p.x)},${one(p.y)}`);
  });
  return { points: pts.join(' '), count: pts.length };
}
