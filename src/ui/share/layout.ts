/**
 * The share image, in two formats: a story (9:16, 1080 x 1920) and a post (4:5, 1080 x 1350).
 * The skyline at dusk, the ticker, the overall price, the type and its line, the five sector
 * prices, the two statements and the name of the product. No answers and no cohort. Pure: no
 * DOM, no canvas.
 *
 * The art is the Skyline scene (see shareArt). Everything else is a list of drawing operations
 * that ShareCard renders as SVG and render.ts paints on a canvas, so the two cannot drift apart.
 *
 * The sky is four flat bands. Each line of text sits inside one band, clear of its edges, and
 * above the tallest tower the scale allows. The stars are drawn here rather than by the scene, so
 * none lands on the text. tests/unit/ui/share.test.ts reads the band edges from the rendered
 * scene and checks every operation of both formats against them.
 */
import { brand, shareCard as copy } from '@/copy/common';
import { TYPES } from '@/copy/types';
import { PRICE_MAX, formatPrice } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { GROUND_Y, HORIZON_Y, LOT_W, ROOF_ROOM, SCENE_H, hash, towerHeight } from '../skyline/geometry';
import { SKY_PALETTES } from '../skyline/palette';
import { measureText, verticalExtent } from './metrics';

export type ShareFormat = 'story' | 'post';
export const SHARE_FORMATS: readonly ShareFormat[] = ['story', 'post'];
/** The share sheet opens on the story. */
export const DEFAULT_SHARE_FORMAT: ShareFormat = 'story';

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT: Readonly<Record<ShareFormat, number>> = { story: 1920, post: 1350 };

export interface ShareSector {
  code: SectorCode;
  /** null when the sector has no price. Its lot is drawn empty and its price is left out. */
  price: number | null;
}

export interface ShareCardData {
  ticker: string;
  /** The overall price. */
  price: number;
  /** The five sectors. */
  sectors: readonly ShareSector[];
  /** The type name, such as "The Engine". null when fewer than two sectors have a price. */
  type: string | null;
  /** The line under the type name. Defaults to the line of the type in src/copy/types.ts. */
  typeLine?: string | null;
  /** Replaces the line about the provisional baseline once the baseline is real. */
  baselineLine?: string;
}

/** The scene: 560 units wide, so the five lots have low neighbours on both sides. */
export const SHARE_SCENE_W = 560;
const SCALE = SHARE_WIDTH / SHARE_SCENE_W;
const LEFT = 72;
const RIGHT = SHARE_WIDTH - 72;
/** Text is set no wider than this. */
export const SHARE_MEASURE = RIGHT - LEFT;

const dusk = SKY_PALETTES.dusk;

/** Colours of the text and the panel. Fixed: the share image is always dusk. */
export const SHARE_COLORS = {
  sky: dusk.sky1,
  panel: dusk.ground2,
  rule: dusk.ground,
  cream: '#FBF3E6',
  muted: '#CFC4EA',
  sun: dusk.sun,
  pill: '#FBF3E6',
  onPill: dusk.sky1,
  star: dusk.star,
  SKIL: '#A9BEFF',
  WLTH: '#FFD27A',
  NETW: '#7FE3D8',
  BODY: '#FFB09C',
  MIND: '#CFBBFF',
  markSKIL: dusk.skilL,
  markWLTH: dusk.wlthF,
  markNETW: dusk.netwL,
  markBODY: dusk.bodyF,
  markMIND: dusk.mindL,
} as const;

export interface ShareFont {
  /** px */
  size: number;
  weight: number;
  family: 'display' | 'text';
  /** CSS font-stretch keyword. semi-condensed is 87.5%. */
  stretch?: 'normal' | 'semi-condensed' | 'condensed';
}

export interface ShareText {
  kind: 'text';
  text: string;
  /** Left edge, right edge or centre, by `align`. */
  x: number;
  /** Alphabetic baseline. */
  y: number;
  align: 'left' | 'right' | 'center';
  color: string;
  font: ShareFont;
  /** Set right after `text` on the same baseline, in its own font: the decimals of a price. Left-aligned text only. */
  tail?: { text: string; font: ShareFont };
}

export type ShareOp = { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; color: string } | ShareText;

export const SHARE_FAMILY = { display: 'Bricolage Grotesque', text: 'Hanken Grotesk' } as const;

const D = (size: number, weight = 700, stretch: ShareFont['stretch'] = 'normal'): ShareFont => ({ size, weight, family: 'display', stretch });
const T = (size: number, weight = 500): ShareFont => ({ size, weight, family: 'text' });

/**
 * Where everything goes, per format. y values are alphabetic baselines unless named otherwise.
 * The sky bands follow from skyTop and panelTop: the scene's sky runs from skyTop to the
 * horizon, and its bands sit at fixed shares of that height (see Backdrop in skyline/scenery).
 */
interface Frame {
  height: number;
  /** Text stays between these two lines. On a story, Instagram draws its header above the first and the reply bar below the second. */
  safeTop: number;
  safeBottom: number;
  /** Where the scene's sky starts. Above it the card is the colour of the top band. */
  skyTop: number;
  /** Where the street ends and the panel with the sector prices starts. */
  panelTop: number;
  /** Where the sun, the clouds and the birds are placed from, in scene units: below the text. */
  detailTop: number;
  /** Which windows are lit. */
  seed: number;
  /** Stars: how many places are tried, from where, and the seed that picks the places. */
  stars: { tries: number; top: number; seed: number };
  pill: { top: number; height: number; ticker: number; label: number };
  price: { y: number; size: number };
  type: { y: number; size: number; line: number; first: number; leading: number };
  board: { codes: number; codeSize: number; prices: number; priceSize: number; rule: number };
  foot: { y: number; leading: number; size: number; brand: number };
}

const FRAMES: Record<ShareFormat, Frame> = {
  story: {
    height: SHARE_HEIGHT.story,
    safeTop: 230,
    safeBottom: SHARE_HEIGHT.story - 240,
    skyTop: 343,
    panelTop: 1452,
    detailTop: 20,
    seed: 5,
    stars: { tries: 90, top: 40, seed: 3 },
    pill: { top: 268, height: 72, ticker: 46, label: 34 },
    price: { y: 586, size: 300 },
    type: { y: 702, size: 84, line: 34, first: 60, leading: 46 },
    board: { codes: 1500, codeSize: 30, prices: 1554, priceSize: 44, rule: 1584 },
    foot: { y: 1626, leading: 38, size: 30, brand: 38 },
  },
  post: {
    height: SHARE_HEIGHT.post,
    safeTop: 0,
    safeBottom: SHARE_HEIGHT.post,
    skyTop: 117,
    panelTop: 1114,
    detailTop: 20,
    seed: 5,
    stars: { tries: 60, top: 24, seed: 3 },
    pill: { top: 64, height: 64, ticker: 40, label: 30 },
    price: { y: 326, size: 240 },
    type: { y: 418, size: 64, line: 30, first: 48, leading: 40 },
    board: { codes: 1162, codeSize: 28, prices: 1212, priceSize: 44, rule: 1238 },
    foot: { y: 1276, leading: 36, size: 28, brand: 36 },
  },
};

/** The size of the image in pixels. */
export function shareSize(format: ShareFormat): { width: number; height: number } {
  return { width: SHARE_WIDTH, height: SHARE_HEIGHT[format] };
}

/** The band of the card where text may go, for tests and for checking a new layout. */
export function shareSafeArea(format: ShareFormat): { top: number; bottom: number } {
  return { top: FRAMES[format].safeTop, bottom: FRAMES[format].safeBottom };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Where the scene sits on the card: its rectangle in px and its crop in scene units. The view
 * runs from `top` down to the bottom of the street, which meets the panel.
 */
export function shareScene(format: ShareFormat): { x: number; y: number; width: number; height: number; top: number; detailTop: number; seed: number } {
  const f = FRAMES[format];
  const horizon = f.panelTop - (SCENE_H - HORIZON_Y) * SCALE;
  // One decimal, as the scene writes its viewBox, so the image is not rescaled to cover.
  const top = round1(HORIZON_Y - (horizon - f.skyTop) / SCALE);
  const height = (SCENE_H - top) * SCALE;
  return { x: 0, y: f.panelTop - height, width: SHARE_WIDTH, height, top, detailTop: f.detailTop, seed: f.seed };
}

/** y on the card of a point of the scene. */
export function shareSceneY(format: ShareFormat, sceneY: number): number {
  const s = shareScene(format);
  return s.y + (sceneY - s.top) * SCALE;
}

/** The highest any tower can reach on the card: the roof at the top of the scale and a crane above it. Text stays above. */
export function shareCeiling(format: ShareFormat): number {
  return shareSceneY(format, GROUND_Y - towerHeight(PRICE_MAX) - ROOF_ROOM);
}

/** The prices by sector, for the Skyline. */
export function sharePrices(data: ShareCardData): Partial<Record<SectorCode, number | null>> {
  const out: Partial<Record<SectorCode, number | null>> = {};
  for (const s of data.sectors) out[s.code] = s.price !== null && Number.isFinite(s.price) ? s.price : null;
  return out;
}

/** x of the centre of a sector's column, under its tower. */
export function shareColumnX(index: number): number {
  return ((SHARE_SCENE_W - LOT_W * 5) / 2 + index * LOT_W + LOT_W / 2) * SCALE;
}

/** The width of a text operation in px, from the glyph tables, tail included. */
export function shareTextWidth(op: Pick<ShareText, 'text' | 'font' | 'tail'>): number {
  const w = (text: string, font: ShareFont) => measureText(text, font.size, font.family, font.stretch, font.weight);
  return w(op.text, op.font) + (op.tail ? w(op.tail.text, op.tail.font) : 0);
}

/** The box a text operation covers, from the glyph tables: left, right, top and bottom in px. */
export function shareTextBox(op: ShareText): { x0: number; x1: number; top: number; bottom: number } {
  const width = shareTextWidth(op);
  const x0 = op.align === 'left' ? op.x : op.align === 'right' ? op.x - width : op.x - width / 2;
  const own = verticalExtent(op.text, op.font.size, op.font.family);
  const tail = op.tail ? verticalExtent(op.tail.text, op.tail.font.size, op.tail.font.family) : { above: 0, below: 0 };
  return { x0, x1: x0 + width, top: op.y - Math.max(own.above, tail.above), bottom: op.y + Math.max(own.below, tail.below) };
}

/**
 * Break a line into at most `max` lines no wider than `width`. Two lines break after a sentence
 * when both halves fit, and otherwise where the two come out closest in length. When it does not
 * fit, the size steps down until it does.
 */
export function shareWrap(text: string, font: ShareFont, width: number, max = 2, minSize = 24): { lines: string[]; font: ShareFont } {
  const fits = (line: string, f: ShareFont) => measureText(line, f.size, f.family, f.stretch, f.weight) <= width;
  for (let size = font.size; size >= minSize; size--) {
    const f = { ...font, size };
    if (fits(text, f)) return { lines: [text], font: f };
    const words = text.split(' ');
    if (max >= 2) {
      let best: string[] | null = null;
      let bestWidth = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const b = words.slice(i).join(' ');
        if (!fits(a, f) || !fits(b, f)) continue;
        if (/[.?]$/.test(a)) return { lines: [a, b], font: f };
        const longer = Math.max(measureText(a, size, f.family, f.stretch, f.weight), measureText(b, size, f.family, f.stretch, f.weight));
        if (longer < bestWidth) {
          bestWidth = longer;
          best = [a, b];
        }
      }
      if (best) return { lines: best, font: f };
    }
  }
  // Too long even at the smallest size: greedy lines, as many as it takes.
  const f = { ...font, size: minSize };
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && fits(`${last} ${word}`, f)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return { lines, font: f };
}

type Box = { x0: number; x1: number; top: number; bottom: number };

/** Room kept around the text and the pill where no star is drawn: wider to the sides, so a star never reads as punctuation. */
export const SHARE_STAR_ROOM = { x: 56, y: 22 } as const;
/** Least distance between two stars. */
const STAR_GAP = 46;

/**
 * Stars in the upper sky. Places come from a fixed sequence, thinned toward the horizon; a place
 * too close to the text, to the pill or to another star is left empty. Everything stays above the
 * tallest tower the scale allows, so no star is drawn over a building.
 */
function stars(format: ShareFormat, keepClear: readonly Box[]): ShareOp[] {
  const f = FRAMES[format];
  const bottom = shareCeiling(format) - 16;
  const placed: Array<[number, number]> = [];
  const ops: ShareOp[] = [];
  for (let i = 0; i < f.stars.tries; i++) {
    const x = 16 + hash(f.stars.seed, i) * (SHARE_WIDTH - 32);
    const y = f.stars.top + hash(f.stars.seed + 1, i) ** 1.3 * (bottom - f.stars.top);
    const r = 1.2 + hash(f.stars.seed + 2, i) * 1.6;
    const room = SHARE_STAR_ROOM;
    if (keepClear.some((b) => x + r > b.x0 - room.x && x - r < b.x1 + room.x && y + r > b.top - room.y && y - r < b.bottom + room.y)) continue;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < STAR_GAP)) continue;
    placed.push([x, y]);
    ops.push({ kind: 'rect', x: x - r, y: y - r, w: r * 2, h: r * 2, r, color: SHARE_COLORS.star });
  }
  return ops;
}

/** The line of a type, by its name. */
function typeLineOf(data: ShareCardData): string | null {
  if (data.typeLine !== undefined) return data.typeLine;
  if (!data.type) return null;
  return TYPES.find((t) => t.name === data.type)?.line ?? null;
}

/** The five bars and the base line of the mark, scaled from a 47 x 37 box whose base sits on `baseline`. */
function mark(x: number, baseline: number, scale: number): ShareOp[] {
  const C = SHARE_COLORS;
  const bars: Array<[number, number, string]> = [
    [0, 21, C.markSKIL],
    [9, 14, C.markWLTH],
    [18, 28, C.markNETW],
    [27, 33, C.markBODY],
    [36, 18, C.markMIND],
  ];
  const ops: ShareOp[] = bars.map(([dx, h, color]) => ({ kind: 'rect', x: x + dx * scale, y: baseline - (h + 3) * scale, w: 7 * scale, h: h * scale, r: 2 * scale, color }));
  ops.push({ kind: 'rect', x: x - 2 * scale, y: baseline, w: 47 * scale, h: 4 * scale, r: 2 * scale, color: C.cream });
  return ops;
}

export interface ShareLayoutOptions {
  /** The site address under the name of the product. Defaults to brand.host; nothing is drawn while it is null. */
  host?: string | null;
}

export function shareCardLayout(data: ShareCardData, format: ShareFormat = 'post', options: ShareLayoutOptions = {}): ShareOp[] {
  const C = SHARE_COLORS;
  const f = FRAMES[format];
  const host = options.host === undefined ? brand.host : options.host;
  const ops: ShareOp[] = [];

  // The ticker on a pill, and what the big number is.
  const ticker = data.ticker.toUpperCase();
  const tickerFont = D(f.pill.ticker, 750);
  const pad = f.pill.height * 0.47;
  const pillW = Math.round(measureText(ticker, tickerFont.size, 'display', 'normal', 750) + pad * 2);
  const mid = f.pill.top + f.pill.height / 2;
  ops.push({ kind: 'rect', x: LEFT, y: f.pill.top, w: pillW, h: f.pill.height, r: f.pill.height / 2, color: C.pill });
  ops.push({ kind: 'text', text: ticker, x: LEFT + pillW / 2, y: Math.round(mid + (tickerFont.size * 0.66) / 2), align: 'center', color: C.onPill, font: tickerFont });
  ops.push({ kind: 'text', text: copy.overall, x: LEFT + pillW + Math.round(f.pill.height * 0.36), y: Math.round(mid + (f.pill.label * 0.697) / 2), align: 'left', color: C.muted, font: T(f.pill.label, 600) });

  // The overall price: the whole number first, the decimals smaller, as on the result.
  const price = formatPrice(data.price);
  const dot = price.indexOf('.');
  ops.push({
    kind: 'text',
    text: price.slice(0, dot),
    // The figures of the display face carry a wide left bearing; this sets the 1 on the margin.
    x: LEFT - Math.round(f.price.size * 0.04),
    y: f.price.y,
    align: 'left',
    color: C.cream,
    font: D(f.price.size, 750, 'semi-condensed'),
    tail: { text: price.slice(dot), font: D(Math.round(f.price.size * 0.46), 700, 'semi-condensed') },
  });

  // The type and its line.
  if (data.type) {
    ops.push({ kind: 'text', text: data.type, x: LEFT, y: f.type.y, align: 'left', color: C.sun, font: D(f.type.size, 700) });
    const line = typeLineOf(data);
    if (line) {
      const wrapped = shareWrap(line, T(f.type.line), SHARE_MEASURE);
      wrapped.lines.forEach((text, i) => {
        ops.push({ kind: 'text', text, x: LEFT, y: f.type.y + f.type.first + i * f.type.leading, align: 'left', color: C.muted, font: wrapped.font });
      });
    }
  }

  // The panel under the street: one column per sector, under its tower.
  ops.push({ kind: 'rect', x: 0, y: f.panelTop, w: SHARE_WIDTH, h: f.height - f.panelTop, color: C.panel });
  SECTOR_CODES.forEach((code, i) => {
    const s = data.sectors.find((x) => x.code === code);
    const x = shareColumnX(i);
    ops.push({ kind: 'text', text: code, x, y: f.board.codes, align: 'center', color: C[code], font: D(f.board.codeSize, 750) });
    if (s && s.price !== null && Number.isFinite(s.price)) {
      ops.push({ kind: 'text', text: formatPrice(s.price), x, y: f.board.prices, align: 'center', color: C.cream, font: D(f.board.priceSize, 700, 'semi-condensed') });
    }
  });
  ops.push({ kind: 'rect', x: LEFT, y: f.board.rule, w: SHARE_MEASURE, h: 2, r: 1, color: C.rule });

  // The foot: the two statements on the left, the product and its address on the right.
  const footFont = T(f.foot.size);
  ops.push({ kind: 'text', text: data.baselineLine ?? copy.baseline, x: LEFT, y: f.foot.y, align: 'left', color: C.muted, font: footFont });
  ops.push({ kind: 'text', text: copy.disclaimer, x: LEFT, y: f.foot.y + f.foot.leading, align: 'left', color: C.muted, font: footFont });
  const wordFont = D(f.foot.brand, 750);
  const wordW = measureText(brand.name, wordFont.size, 'display', 'normal', 750);
  const markScale = (f.foot.brand * 0.72) / 37;
  ops.push(...mark(RIGHT - wordW - Math.round(f.foot.brand * 0.36) - 45 * markScale, f.foot.y, markScale));
  ops.push({ kind: 'text', text: brand.name, x: RIGHT, y: f.foot.y, align: 'right', color: C.cream, font: wordFont });
  if (host) {
    ops.push({ kind: 'text', text: host, x: RIGHT, y: f.foot.y + f.foot.leading, align: 'right', color: C.cream, font: T(f.foot.size, 600) });
  }

  // The stars go first, under everything, and keep clear of the pill and of every line in the sky.
  const keepClear: Box[] = [{ x0: LEFT, x1: LEFT + pillW, top: f.pill.top, bottom: f.pill.top + f.pill.height }];
  for (const op of ops) if (op.kind === 'text' && op.y < f.panelTop) keepClear.push(shareTextBox(op));
  return [...stars(format, keepClear), ...ops];
}

/** The CSS font shorthand for an operation, for canvas and for document.fonts.load. */
export function shareFontShorthand(font: ShareFont): string {
  const stretch = font.stretch && font.stretch !== 'normal' ? `${font.stretch} ` : '';
  return `${stretch}${font.weight} ${Math.round(font.size * 100) / 100}px "${SHARE_FAMILY[font.family]}"`;
}
