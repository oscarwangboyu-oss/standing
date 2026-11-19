/**
 * Skyline geometry. Pure functions and constants, no DOM, so they can be tested directly.
 *
 * One scale for every skyline in the product:
 *   - the street is the bottom of every tower;
 *   - every tower has a podium of PODIUM units, so a price of 55 is still a complete building;
 *   - above the podium, one point of price is PER_POINT units of height;
 *   - the horizon is drawn where a price of 100 ends. A tower above 100 crosses the horizon.
 */
import { ISSUE_PRICE, PRICE_MAX, PRICE_MIN, clamp } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';

/** Width of the five lots plus the side margins, in viewBox units. */
export const SCENE_W = 440;
/** Height of the full scene: sky, towers, street. */
export const SCENE_H = 300;
/** y of the street line. Towers stand on it. */
export const GROUND_Y = 262;
/** Height of the base every tower has, whatever its price. */
export const PODIUM = 20;
/** Height per point of price above 55. */
export const PER_POINT = 2.3;
/** One floor is five points. */
export const FLOOR = PER_POINT * 5;
/** Width of one lot. The five lots sit side by side with no gap. */
export const LOT_W = 80;
/** Margin left and right of the five lots. */
export const LOT_MARGIN = (SCENE_W - LOT_W * 5) / 2;
/** Room kept above the tallest roof for cranes, domes and sky. */
export const ROOF_ROOM = 34;

/** Height of a tower from the street to its roof line, for a price. Prices outside 55 to 145 stop at the ends. */
export function towerHeight(price: number): number {
  const p = clamp(Number.isFinite(price) ? price : ISSUE_PRICE, PRICE_MIN, PRICE_MAX);
  return PODIUM + (p - PRICE_MIN) * PER_POINT;
}

/** The price a tower of this height shows. The inverse of towerHeight. */
export function priceAtHeight(height: number): number {
  return PRICE_MIN + (height - PODIUM) / PER_POINT;
}

/** y of the horizon: where a price of 100 ends. */
export const HORIZON_Y = GROUND_Y - towerHeight(ISSUE_PRICE);

/** x of the left edge of a sector's lot, for a scene that is `sceneWidth` wide. The lots are centred. */
export function lotX(index: number, sceneWidth: number = SCENE_W): number {
  return (sceneWidth - LOT_W * 5) / 2 + index * LOT_W;
}

export function lotIndex(code: SectorCode): number {
  return SECTOR_CODES.indexOf(code);
}

/**
 * Height of a tower that is being built during the check: `built` of `total` questions answered.
 * Every answer adds the same share of the full height. Nothing is built before the first answer.
 */
export function builtHeight(built: number, total: number, full: number = towerHeight(ISSUE_PRICE)): number {
  if (!(total > 0)) return 0;
  return full * clamp(built / total, 0, 1);
}

/**
 * The top of the view, so that a skyline of ordinary prices is not mostly empty sky.
 * It keeps ROOF_ROOM above the tallest tower and never cuts the horizon.
 */
export function viewTop(heights: readonly number[], room: number = ROOF_ROOM): number {
  const tallest = Math.max(towerHeight(ISSUE_PRICE), ...heights.filter((h) => Number.isFinite(h)));
  const top = GROUND_Y - tallest - room;
  return Math.max(0, Math.min(Math.floor(top), HORIZON_Y - 40));
}

/** A repeatable number from 0 to 1 for a seed and an index. The same skyline is drawn the same way every time. */
export function hash(seed: number, index: number): number {
  let t = (seed * 374761393 + index * 668265263) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
  t = (t ^ (t >>> 16)) >>> 0;
  return t / 4294967296;
}

const r1 = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};
/** Trim a coordinate to one decimal. */
export const n1 = r1;

export interface WindowGrid {
  /** Left edge of the first column. */
  x: number;
  /** The grid fills from `bottom` upward and stops before `top` (y grows downward, so top < bottom). */
  top: number;
  bottom: number;
  cols: number;
  /** Distance between columns and between rows. */
  pitchX: number;
  pitchY: number;
  winW: number;
  winH: number;
  seed: number;
  /** Share of windows with the light on, 0 to 1. */
  lit: number;
}

/**
 * All windows of one face as two path strings: glass and lit. Two paths per face keep the markup
 * small however tall the tower is. Rows are counted from the street, so floors line up across towers.
 */
export function windowPaths(g: WindowGrid): { glass: string; lit: string; rows: number } {
  let glass = '';
  let lit = '';
  let rows = 0;
  for (let y = g.bottom - g.pitchY; y >= g.top - 0.01; y -= g.pitchY) {
    for (let c = 0; c < g.cols; c++) {
      const d = `M${r1(g.x + c * g.pitchX)} ${r1(y)}h${r1(g.winW)}v${r1(g.winH)}h${r1(-g.winW)}z`;
      if (hash(g.seed, rows * 31 + c) < g.lit) lit += d;
      else glass += d;
    }
    rows++;
  }
  return { glass, lit, rows };
}
