/**
 * The share image at 1080 x 1350: the skyline at dusk, the ticker, the overall price, the type
 * name and the five sector prices. No answers and no cohort. Pure: no DOM, no canvas.
 *
 * The art is the Skyline scene (see shareArt). Everything else is a list of drawing operations
 * that ShareCard renders as SVG and render.ts paints on a canvas, so the two cannot drift apart.
 */
import { brand, shareCard as copy } from '@/copy/common';
import { formatPrice } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { LOT_W, SCENE_H } from '../skyline/geometry';
import { SKY_PALETTES } from '../skyline/palette';

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1350;

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
  /** Replaces the line about the provisional baseline once the baseline is real. */
  baselineLine?: string;
}

/** The scene: 560 units wide, so the five lots have low neighbours on both sides and the tallest possible tower stays under the text. */
export const SHARE_SCENE_W = 560;
/** The scene fills the card from the top down to this y. Below it is the panel with the sector prices. */
export const SHARE_ART_H = 1130;
const SCALE = SHARE_WIDTH / SHARE_SCENE_W;
/** Top of the view in scene units: far above the towers, so the sky fills the card. */
export const SHARE_ART_TOP = SCENE_H - SHARE_ART_H / SCALE;

const dusk = SKY_PALETTES.dusk;

/** Colours of the text and the panel. Fixed: the share image is always dusk. */
export const SHARE_COLORS = {
  sky: dusk.sky1,
  panel: dusk.ground2,
  cream: '#FBF3E6',
  muted: '#CFC4EA',
  sun: dusk.sun,
  pill: '#FBF3E6',
  onPill: dusk.sky1,
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

export type ShareOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; color: string }
  | {
      kind: 'text';
      text: string;
      /** Left edge, right edge or centre, by `align`. */
      x: number;
      /** Alphabetic baseline. */
      y: number;
      align: 'left' | 'right' | 'center';
      color: string;
      font: ShareFont;
    };

export const SHARE_FAMILY = { display: 'Bricolage Grotesque', text: 'Hanken Grotesk' } as const;

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

const D = (size: number, weight = 700, stretch: ShareFont['stretch'] = 'normal'): ShareFont => ({ size, weight, family: 'display', stretch });
const T = (size: number, weight = 500): ShareFont => ({ size, weight, family: 'text' });

export function shareCardLayout(data: ShareCardData): ShareOp[] {
  const C = SHARE_COLORS;
  const ops: ShareOp[] = [];
  const left = 72;
  const right = SHARE_WIDTH - 72;

  // The mark and the name.
  const bars: Array<[number, number, string]> = [
    [0, 21, C.markSKIL],
    [9, 14, C.markWLTH],
    [18, 28, C.markNETW],
    [27, 33, C.markBODY],
    [36, 18, C.markMIND],
  ];
  for (const [dx, h, color] of bars) ops.push({ kind: 'rect', x: left + dx, y: 124 - h, w: 7, h, r: 2, color });
  ops.push({ kind: 'rect', x: left - 2, y: 127, w: 47, h: 4, r: 2, color: C.cream });
  ops.push({ kind: 'text', text: brand.name, x: left + 60, y: 126, align: 'left', color: C.cream, font: D(44, 750) });

  // The ticker, on a pill.
  const ticker = data.ticker.toUpperCase();
  const pillW = Math.round(ticker.length * 30 + 64);
  ops.push({ kind: 'rect', x: right - pillW, y: 72, w: pillW, h: 68, r: 34, color: C.pill });
  ops.push({ kind: 'text', text: ticker, x: right - pillW / 2, y: 121, align: 'center', color: C.onPill, font: D(42, 750) });

  // The overall price.
  ops.push({ kind: 'text', text: copy.overall, x: left, y: 244, align: 'left', color: C.muted, font: T(30, 600) });
  ops.push({ kind: 'text', text: formatPrice(data.price), x: left - 10, y: 444, align: 'left', color: C.cream, font: D(250, 750, 'semi-condensed') });

  // The type.
  if (data.type) {
    ops.push({ kind: 'text', text: data.type, x: left, y: 534, align: 'left', color: C.sun, font: D(72, 700) });
  }

  // The panel under the street: one column per sector, under its tower.
  ops.push({ kind: 'rect', x: 0, y: SHARE_ART_H, w: SHARE_WIDTH, h: SHARE_HEIGHT - SHARE_ART_H, color: C.panel });
  SECTOR_CODES.forEach((code, i) => {
    const s = data.sectors.find((x) => x.code === code);
    const x = shareColumnX(i);
    ops.push({ kind: 'text', text: code, x, y: 1192, align: 'center', color: C[code], font: D(27, 750) });
    if (s && s.price !== null && Number.isFinite(s.price)) {
      ops.push({ kind: 'text', text: formatPrice(s.price), x, y: 1244, align: 'center', color: C.cream, font: D(44, 700, 'semi-condensed') });
    }
  });

  // The foot.
  ops.push({ kind: 'text', text: data.baselineLine ?? copy.baseline, x: left, y: 1308, align: 'left', color: C.muted, font: T(22) });
  ops.push({ kind: 'text', text: copy.disclaimer, x: right, y: 1308, align: 'right', color: C.muted, font: T(22) });
  return ops;
}

/** The CSS font shorthand for an operation, for canvas and for document.fonts.load. */
export function shareFontShorthand(font: ShareFont): string {
  return `${font.weight} ${Math.round(font.size * 100) / 100}px "${SHARE_FAMILY[font.family]}"`;
}
