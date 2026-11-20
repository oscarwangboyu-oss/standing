import { useId, type CSSProperties } from 'react';
import { skyline as copy, sectorNames } from '@/copy/common';
import { cx } from '../cx';
import { ISSUE_PRICE, formatPrice } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { Barrier, EmptyLot, Scaffold, TOWERS, type Detail } from './buildings';
import { GROUND_Y, HORIZON_Y, LOT_W, ROOF_ROOM, SCENE_H, SCENE_W, builtHeight, lotX, n1, towerHeight, viewTop } from './geometry';
import { SKY_PALETTES, SKY_VARS, towerColors, type SkyPalette, type SkyTime } from './palette';
import { Backdrop, Neighbours, Street } from './scenery';
import styles from './skyline.module.css';

/** listed: has a price. unlisted: excluded by consent. insufficient: too few answers. halted: no recent record. */
export type TowerStatus = 'listed' | 'unlisted' | 'insufficient' | 'halted';

export type SkylineSize = 'glyph' | 'small' | 'card' | 'hero';

export interface SkylineProps {
  /** The five prices. A sector without a price is null or left out. */
  prices: Partial<Record<SectorCode, number | null>>;
  /** Defaults to listed for a sector with a price and insufficient for one without. */
  status?: Partial<Record<SectorCode, TowerStatus>>;
  /** auto follows the theme: day in light, night in dark. dusk is the share image. */
  time?: 'auto' | SkyTime;
  /**
   * glyph: towers only, for 48 to 96px. small: sky, bay and street, no street life, for 120 to 240px.
   * card: the full scene, 4:3-ish. hero: the wide scene with neighbours; under 700px it is cropped
   * to the five lots, so the towers keep their size on a phone.
   */
  size?: SkylineSize;
  /** Towers rise from the street to their height, once, when the skyline is first shown. */
  rise?: boolean;
  /** Which sectors have their lights on: a sector updated today. Leave out and every tower is lit normally. */
  lit?: Partial<Record<SectorCode, boolean>>;
  /**
   * Progress of the check. When set, prices are ignored: every tower is built toward the height
   * of 100, one share per answered question, and a sector with no answers is an empty lot.
   */
  build?: Partial<Record<SectorCode, { built: number; total: number }>>;
  /** The sector being answered, marked with a pin above its lot. */
  active?: SectorCode;
  /** Show the "100" tag on the horizon. Default: on for card and hero. */
  horizonLabel?: boolean;
  /** Top of the view in scene units, to give two skylines the same crop. Default: fitted to the tallest tower. */
  top?: number;
  /** Plain colours instead of custom properties, for an image that is drawn outside the page. */
  palette?: SkyPalette;
  /** Replaces the generated description. Pass an empty string when the skyline is decoration next to the same numbers. */
  label?: string;
  /** Width of the scene in units, when it must differ from the size preset. Neighbours appear from 520. */
  sceneWidth?: number;
  /** Where clouds and the sun are placed from, when the sky runs far above the towers (the share image). Default: the top. */
  detailTop?: number;
  /** Changes which windows are lit and where the small details sit. */
  seed?: number;
  /** The scene has rounded corners. Default: on for small and card. */
  framed?: boolean;
  className?: string;
  style?: CSSProperties;
}

const DETAIL: Record<SkylineSize, Detail> = { glyph: 0, small: 1, card: 2, hero: 2 };
const WIDTH: Record<SkylineSize, number> = { glyph: LOT_W * 5, small: SCENE_W, card: SCENE_W, hero: 800 };

function statusOf(code: SectorCode, props: SkylineProps): TowerStatus {
  const given = props.status?.[code];
  if (given) return given;
  const price = props.prices[code];
  return typeof price === 'number' && Number.isFinite(price) ? 'listed' : 'insufficient';
}

/** The heights the skyline will draw, for callers that need to share one crop between two skylines. */
export function skylineTop(...sets: Array<Partial<Record<SectorCode, number | null>>>): number {
  const heights: number[] = [];
  for (const prices of sets) {
    for (const code of SECTOR_CODES) {
      const v = prices[code];
      if (typeof v === 'number' && Number.isFinite(v)) heights.push(towerHeight(v));
    }
  }
  return viewTop(heights);
}

interface Resolved {
  towers: Array<{ code: SectorCode; i: number; status: TowerStatus; target: number; shown: number; done: boolean }>;
  top: number;
  height: number;
  w: number;
  detail: Detail;
  glyph: boolean;
  described: string;
}

function resolve(props: SkylineProps): Resolved {
  const { prices, size = 'card', build } = props;
  const glyph = size === 'glyph';
  const full = towerHeight(ISSUE_PRICE);
  const towers = SECTOR_CODES.map((code, i) => {
    const status: TowerStatus = build ? 'listed' : statusOf(code, props);
    const price = prices[code];
    const b = build?.[code];
    const target = build ? full : status === 'listed' || status === 'halted' ? towerHeight(price as number) : 0;
    const shown = build ? builtHeight(b?.built ?? 0, b?.total ?? 0, full) : target;
    return { code, i, status, target, shown, done: build ? !!b && b.total > 0 && b.built >= b.total : true };
  });
  const top = props.top ?? (build ? viewTop([full]) : viewTop(towers.map((t) => t.target), glyph ? 30 : ROOF_ROOM));
  const bottom = glyph ? GROUND_Y + 3 : size === 'small' ? GROUND_Y + 14 : SCENE_H;
  const described =
    props.label ??
    (build
      ? copy.building
      : copy.describe(
          towers.map((t) =>
            t.status === 'listed' || t.status === 'halted'
              ? `${sectorNames[t.code]} ${formatPrice(prices[t.code] as number)}${t.status === 'halted' ? ` (${copy.halted})` : ''}`
              : `${sectorNames[t.code]} ${t.status === 'unlisted' ? copy.unlisted : copy.insufficient}`,
          ),
        ));
  return { towers, top, height: bottom - top, w: props.sceneWidth ?? WIDTH[size], detail: DETAIL[size], glyph, described };
}

/** Left and right edge of each tower on the street, inside its lot. */
const FOOTPRINT: Record<SectorCode, readonly [number, number]> = { SKIL: [5, 71], WLTH: [3, 77], NETW: [4, 76], BODY: [10, 63], MIND: [12, 67] };

/** The sun sits above the shortest tower (the later one on a tie), a little over its roof, so no tower hides it. */
function sunSpot(r: Resolved, detailTop?: number): { x: number; y: number } {
  let pick = r.towers[r.towers.length - 1]!;
  for (const t of r.towers) if (t.shown <= pick.shown) pick = t;
  const top = detailTop ?? r.top;
  const y = Math.max(top + 24, Math.min(HORIZON_Y - 30, GROUND_Y - pick.shown - 50));
  return { x: lotX(pick.i, r.w) + LOT_W / 2, y };
}

export interface SkylineSceneProps extends SkylineProps {
  /** Position and size when the scene is nested in a larger SVG, such as the share image. */
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
}

/** The scene as a bare <svg>, for nesting in another SVG or for drawing to a canvas. Skyline wraps it for the page. */
export function SkylineScene(props: SkylineSceneProps) {
  const { time = 'auto', lit, build, active, palette, seed = 7, x, y, width, height } = props;
  const clip = useId();
  const p = palette ?? SKY_VARS;
  const r = resolve(props);
  const full = towerHeight(ISSUE_PRICE);
  const timeClass = time === 'auto' || palette ? undefined : `k-${time}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={timeClass}
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`0 ${r.top} ${r.w} ${n1(r.height)}`}
      role={r.described ? 'img' : undefined}
      aria-label={r.described || undefined}
      aria-hidden={r.described ? undefined : true}
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <clipPath id={clip} clipPathUnits="userSpaceOnUse">
          <rect x={-60} y={-400} width={200} height={400} />
        </clipPath>
      </defs>
      {!r.glyph && <Backdrop p={p} w={r.w} top={r.top} detailTop={props.detailTop} detail={r.detail} seed={seed} sun={sunSpot(r, props.detailTop)} />}
      {!r.glyph && r.w >= 520 && <Neighbours p={p} w={r.w} seed={seed} />}
      {r.glyph && <rect x={0} y={GROUND_Y} width={r.w} height={3} rx={1.5} fill={p.ghost} />}
      {/* Each tower throws a short shadow to the right, away from the light. */}
      {!r.glyph &&
        r.towers.map((t) => {
          if (t.shown <= 0) return null;
          const [a, b] = FOOTPRINT[t.code];
          const x = lotX(t.i, r.w);
          return <path key={t.code} d={`M${n1(x + a)} ${GROUND_Y + 2.4}H${n1(x + b)}l11 8H${n1(x + a + 11)}z`} fill={p.ground2} opacity={0.55} />;
        })}
      {r.towers.map((t) => {
        const Tower = TOWERS[t.code];
        const c = towerColors(p, t.code);
        const on = lit?.[t.code];
        const litShare = t.status === 'halted' ? 0 : on === undefined ? 0.4 : on ? 0.62 : 0.04;
        const hidden = build ? (t.shown <= 0 ? full + 60 : t.done ? 0 : full - t.shown) : 0;
        const tower = t.target > 0 && (
          <g
            className={styles.tower}
            style={{ '--h': n1(t.target + 44), '--i': t.i, transform: hidden ? `translateY(${n1(hidden)}px)` : undefined } as CSSProperties}
            opacity={t.status === 'halted' ? 0.5 : undefined}
          >
            <Tower h={t.target} c={c} p={p} detail={r.detail} lit={litShare} seed={seed + t.i * 17} />
          </g>
        );
        return (
          <g key={t.code} transform={`translate(${n1(lotX(t.i, r.w))} ${GROUND_Y})`} clipPath={`url(#${clip})`} data-sector={t.code}>
            {(t.status === 'unlisted' || (build && t.shown <= 0)) && <EmptyLot p={p} detail={r.detail} />}
            {t.status === 'insufficient' && <Scaffold p={p} detail={r.detail} />}
            {tower}
            {t.status === 'halted' && r.detail > 0 && <Barrier p={p} />}
            {/* The pin marks the lot being answered. On an empty lot it stands in the ground on a
                stem, between the sign and the tree; once floors rise it rides above the roof. */}
            {build && active === t.code && !t.done && (
              <g className={styles.pin} style={{ transform: `translateY(${n1(t.shown > 0 ? -(t.shown + 8) : 0)}px)` }}>
                {t.shown <= 0 && <path d="M40 -30V-9" stroke={p.ink} strokeWidth={2} strokeLinecap="round" />}
                <path d="M40 -30l-7 -10h14z" fill={p.ink} />
              </g>
            )}
          </g>
        );
      })}
      {!r.glyph && <Street p={p} w={r.w} top={r.top} detail={r.detail} seed={seed} />}
    </svg>
  );
}

/**
 * Where a person stands, drawn as a city. Five towers, one per sector, in sector order. The
 * street is the base, the horizon is 100, and a tower's roof line is its price.
 */
export function Skyline(props: SkylineProps) {
  const { size = 'card', rise = false, className, style } = props;
  const r = resolve(props);
  const showLabel = (props.horizonLabel ?? (size === 'card' || size === 'hero')) && !r.glyph;
  const framed = props.framed ?? (size === 'small' || size === 'card');
  return (
    <div
      className={cx(styles.sky, styles[size], framed && styles.framed, rise && styles.rise, className)}
      style={
        size === 'hero'
          ? ({ '--ar-wide': `${r.w} / ${n1(r.height)}`, '--ar-narrow': `${SCENE_W} / ${n1(r.height)}`, ...style } as CSSProperties)
          : { aspectRatio: `${r.w} / ${n1(r.height)}`, ...style }
      }
    >
      <SkylineScene {...props} />
      {showLabel && (
        <span className={styles.hundred} style={{ top: `${n1(((HORIZON_Y - r.top) / r.height) * 100)}%` }} aria-hidden="true">
          100
        </span>
      )}
    </div>
  );
}

/** The palette for an image drawn outside the page. */
export function skyPalette(time: SkyTime): SkyPalette {
  return SKY_PALETTES[time];
}
