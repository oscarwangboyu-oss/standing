/**
 * Everything in the scene that is not a tower: the sky in four flat bands, the sun or the moon,
 * clouds, the bay behind the city, the street, and the small living details. The horizon, where
 * the sky meets the water, is the price of 100.
 */
import type { ReactNode } from 'react';
import { GROUND_Y, HORIZON_Y, LOT_W, SCENE_H, hash, n1 } from './geometry';
import type { Detail } from './buildings';
import type { SkyPalette } from './palette';

const isNumber = (s: string) => /^[0-9.]+$/.test(s);
/** Opacity for things that only exist at one time of day. Works with custom properties and with plain values. */
function when(p: SkyPalette, ...keys: Array<'dayOn' | 'nightOn' | 'duskOn'>): string {
  const parts = keys.map((k) => p[k]);
  if (parts.every(isNumber)) return String(Math.min(1, parts.reduce((s, v) => s + Number(v), 0)));
  return parts.length === 1 ? (parts[0] as string) : `calc(${parts.join(' + ')})`;
}

/** A crescent: a disc of radius 11 with a disc of radius 9.5 cut from its upper right. One path, so it sits on any sky. */
export const MOON = 'M-0.1 -11A11 11 0 1 0 9.6 5.3A9.5 9.5 0 0 1 -0.1 -11z';

function Cloud({ x, y, s = 1, p }: { x: number; y: number; s?: number; p: SkyPalette }) {
  return (
    <g transform={`translate(${n1(x)} ${n1(y)}) scale(${s})`}>
      <rect x={0} y={0} width={40} height={10} rx={5} fill={p.cloud} />
      <rect x={9} y={-7} width={22} height={12} rx={6} fill={p.cloud} />
      <rect x={-8} y={6} width={30} height={7} rx={3.5} fill={p.cloud2} />
    </g>
  );
}

export interface SceneryProps {
  p: SkyPalette;
  /** Scene width in units. */
  w: number;
  /** Top of the view. The sky starts here. */
  top: number;
  /** Where the sun and the clouds are placed from. Default: the top of the view. */
  detailTop?: number;
  detail: Detail;
  seed: number;
  /** Where the daytime sun sits. The skyline puts it above its shortest tower, so it is never hidden. */
  sun?: { x: number; y: number };
}

/** The sky, the bay and the street. Drawn behind the towers. */
export function Backdrop({ p, w, top, detailTop, detail, seed, sun }: SceneryProps) {
  const dx = (w - LOT_W * 5) / 2;
  const sky = HORIZON_Y - top;
  const dTop = detailTop ?? top;
  const dSky = HORIZON_Y - dTop;
  const b1 = top + sky * 0.34;
  const b2 = top + sky * 0.62;
  const b3 = top + sky * 0.84;
  const stars: ReactNode[] = [];
  const glints: string[] = [];
  if (detail > 0) {
    for (let i = 0; i < Math.round(w / 26); i++) {
      const sx = hash(seed + 11, i) * w;
      const sy = top + 6 + hash(seed + 12, i) * (sky - 34);
      stars.push(<circle key={i} cx={n1(sx)} cy={n1(sy)} r={n1(0.6 + hash(seed + 13, i) * 0.8)} />);
    }
    for (let i = 0; i < Math.round(w / 34); i++) {
      const gx = hash(seed + 21, i) * (w - 24);
      const gy = HORIZON_Y + 7 + hash(seed + 22, i) * (GROUND_Y - HORIZON_Y - 16);
      glints.push(`M${n1(gx)} ${n1(gy)}h${n1(7 + hash(seed + 23, i) * 13)}`);
    }
  }
  const sunX = sun?.x ?? dx + 62;
  const sunY = sun?.y ?? Math.max(dTop + 34, HORIZON_Y - 62);
  return (
    <>
      <rect x={0} y={top} width={w} height={n1(b1 - top + 0.5)} fill={p.sky1} />
      <rect x={0} y={n1(b1)} width={w} height={n1(b2 - b1 + 0.5)} fill={p.sky2} />
      <rect x={0} y={n1(b2)} width={w} height={n1(b3 - b2 + 0.5)} fill={p.sky3} />
      <rect x={0} y={n1(b3)} width={w} height={n1(HORIZON_Y - b3)} fill={p.sky4} />
      {stars.length > 0 && (
        <g fill={p.star} style={{ opacity: when(p, 'nightOn', 'duskOn') }}>
          {stars}
        </g>
      )}
      {/* Day: the sun, high on the left. */}
      <g style={{ opacity: when(p, 'dayOn') }}>
        <circle cx={n1(sunX)} cy={n1(sunY)} r={25} fill={p.halo} opacity={0.6} />
        <circle cx={n1(sunX)} cy={n1(sunY)} r={15.5} fill={p.sun} />
      </g>
      {/* Night: a crescent moon on the right. */}
      <g style={{ opacity: when(p, 'nightOn') }} transform={`translate(${n1(w - dx - 52)} ${n1(dTop + 30)})`}>
        <path d={MOON} fill={p.sun} />
      </g>
      {/* Dusk: a large sun going down behind the city. */}
      <g style={{ opacity: when(p, 'duskOn') }}>
        <circle cx={n1(w / 2 - 18)} cy={HORIZON_Y} r={92} fill={p.halo} opacity={0.34} />
        <circle cx={n1(w / 2 - 18)} cy={HORIZON_Y} r={64} fill={p.sun} />
      </g>
      {detail > 0 && (
        <>
          <Cloud x={dx + 300} y={dTop + dSky * 0.5} p={p} />
          <Cloud x={dx + 132} y={dTop + dSky * 0.24} s={0.7} p={p} />
          {w > 500 && <Cloud x={dx - 120} y={dTop + dSky * 0.62} s={0.85} p={p} />}
          {w > 500 && <Cloud x={dx + 500} y={dTop + dSky * 0.3} s={1.1} p={p} />}
        </>
      )}
      {detail > 1 && (
        <>
          <g style={{ opacity: when(p, 'dayOn', 'duskOn') }} stroke={p.ink} strokeWidth={0.9} strokeLinecap="round" fill="none">
            <path d={`M${n1(dx + 236)} ${n1(dTop + dSky * 0.2)}q2.6 -2.8 5 0q2.6 -2.8 5 0`} />
            <path d={`M${n1(dx + 251)} ${n1(dTop + dSky * 0.2 + 7)}q2 -2.2 4 0q2 -2.2 4 0`} />
            <path d={`M${n1(dx + 96)} ${n1(dTop + dSky * 0.56)}q2 -2.2 4 0q2 -2.2 4 0`} />
          </g>
          {/* A hot-air balloon, far out. */}
          <g transform={`translate(${n1(dx + 408)} ${n1(dTop + dSky * 0.42)})`} style={{ opacity: when(p, 'dayOn') }}>
            <circle r={8.5} fill={p.flag} />
            <path d="M-3.2 -7.9a8.5 8.5 0 0 0 0 15.8a14 14 0 0 1 0 -15.8zM3.2 -7.9a8.5 8.5 0 0 1 0 15.8a14 14 0 0 0 0 -15.8z" fill={p.crane} />
            <path d="M-5.6 6.4L-1.8 13h3.6L5.6 6.4z" fill={p.flag} />
            <rect x={-2} y={14.4} width={4} height={3.2} fill={p.trunk} />
          </g>
        </>
      )}
      {/* The bay. Its far edge is the horizon. */}
      <rect x={0} y={HORIZON_Y} width={w} height={n1(GROUND_Y - HORIZON_Y)} fill={p.water} />
      {glints.length > 0 && <path d={glints.join('')} stroke={p.water2} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />}
      <rect x={0} y={HORIZON_Y} width={w} height={3.4} fill={p.shore} />
      <rect x={0} y={n1(HORIZON_Y - 0.6)} width={w} height={1.2} fill={p.horizon} />
      {detail > 1 && (
        <g transform={`translate(${n1(dx + 91)} ${n1(HORIZON_Y + 15)})`}>
          <path d="M0 -1V-13L8 -1z" fill={p.cloud} />
          <path d="M-1.2 -1V-9.6L-5.6 -1z" fill={p.cloud2} />
          <path d="M-7 0h16l-2.8 3.4h-10.4z" fill={p.ink} />
        </g>
      )}
      {/* The street. */}
      <rect x={0} y={GROUND_Y} width={w} height={SCENE_H - GROUND_Y} fill={p.ground} />
      <rect x={0} y={GROUND_Y} width={w} height={2.4} fill={p.ground2} />
      {detail > 0 && <path d={`M0 ${GROUND_Y + 21}H${w}`} stroke={p.path} strokeWidth={2} strokeDasharray="12 9" />}
    </>
  );
}

/** Low buildings beside the five lots, in quiet colours. Only in the wide scene. They stay under the horizon. */
export function Neighbours({ p, w, seed }: { p: SkyPalette; w: number; seed: number }) {
  const dx = (w - LOT_W * 5) / 2;
  if (dx < 60) return null;
  const blocks: ReactNode[] = [];
  let wins = '';
  const run = (from: number, to: number, key: string) => {
    let x = from;
    let i = 0;
    while (x < to - 20) {
      const bw = 26 + Math.round(hash(seed + 31, x) * 22);
      const bh = 26 + Math.round(hash(seed + 32, x) * 62);
      const width = Math.min(bw, to - x);
      blocks.push(
        <g key={`${key}${i}`}>
          <rect x={n1(x)} y={GROUND_Y - bh} width={n1(width)} height={bh} fill={p.n1} />
          <rect x={n1(x + width - 5)} y={GROUND_Y - bh} width={5} height={bh} fill={p.n2} />
          {hash(seed + 35, x) < 0.34 && <rect x={n1(x + 5)} y={GROUND_Y - bh - 6} width={9} height={6} fill={p.n2} />}
          {hash(seed + 35, x) > 0.7 && <path d={`M${n1(x + width * 0.4)} ${GROUND_Y - bh}v-11`} stroke={p.n2} strokeWidth={1.2} />}
          {hash(seed + 36, x) > 0.62 && <path d={`M${n1(x)} ${GROUND_Y - bh}l${n1(width / 2)} -7l${n1(width / 2)} 7z`} fill={p.n1} />}
        </g>,
      );
      for (let wy = GROUND_Y - bh + 6; wy < GROUND_Y - 9; wy += 9) {
        for (let wx = x + 4; wx < x + width - 10; wx += 7.5) {
          if (hash(seed + 33, Math.round(wx * 7 + wy)) < 0.6) wins += `M${n1(wx)} ${n1(wy)}h4v4.6h-4z`;
        }
      }
      x += bw + 6 + Math.round(hash(seed + 34, x) * 14);
      i++;
    }
  };
  run(8, dx - 4, 'l');
  run(w - dx + 12, w - 6, 'r');
  return (
    <>
      {blocks}
      {wins && <path d={wins} fill={p.nwin} />}
    </>
  );
}

function Tree({ x, s = 1, p }: { x: number; s?: number; p: SkyPalette }) {
  return (
    <g transform={`translate(${n1(x)} ${GROUND_Y + 7}) scale(${s})`}>
      <rect x={-0.9} y={-10} width={1.8} height={10} fill={p.trunk} />
      <circle cx={0} cy={-15} r={7} fill={p.tree} />
      <circle cx={2.2} cy={-12.8} r={4.6} fill={p.tree2} />
    </g>
  );
}

function Lamp({ x, p }: { x: number; p: SkyPalette }) {
  return (
    <g transform={`translate(${n1(x)} ${GROUND_Y + 8})`}>
      <circle cx={4.6} cy={-21.4} r={7} fill={p.lit} style={{ opacity: `calc(${when(p, 'nightOn', 'duskOn')} * 0.28)` }} />
      <path d="M0 0V-22h4.6" stroke={p.ink} strokeWidth={1} fill="none" strokeLinecap="round" />
      <rect x={2.8} y={-22.6} width={3.8} height={2.2} rx={1} fill={p.lit} />
    </g>
  );
}

/** Trees, lamps and people on the street. Drawn in front of the towers. */
export function Street({ p, w, detail }: SceneryProps) {
  if (detail < 2) return null;
  const dx = (w - LOT_W * 5) / 2;
  const y = GROUND_Y + 22;
  return (
    <>
      <Tree x={dx + 2} p={p} />
      <Tree x={dx + 161} s={0.82} p={p} />
      <Tree x={dx + 322} s={0.9} p={p} />
      <Tree x={dx + 398} s={1.05} p={p} />
      <Lamp x={dx + 83} p={p} />
      <Lamp x={dx + 243} p={p} />
      {w > 500 && (
        <>
          <Tree x={dx - 46} s={0.95} p={p} />
          <Tree x={dx - 118} s={0.8} p={p} />
          <Tree x={dx + 452} s={0.85} p={p} />
          <Tree x={dx + 520} s={1} p={p} />
          <Lamp x={dx - 80} p={p} />
          <Lamp x={dx + 484} p={p} />
        </>
      )}
      {/* A cyclist. */}
      <g transform={`translate(${n1(dx + 196)} ${y})`} stroke={p.ink} strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx={0} cy={0} r={4.2} />
        <circle cx={12} cy={0} r={4.2} />
        <path d="M0 0l4.4 -6h5.2L12 0M4.4 -6L6.4 0M9.6 -6l-1 -2.2h2.2M5.4 -9.4l4 3.2" />
        <circle cx={5} cy={-11.6} r={1.9} fill={p.ink} stroke="none" />
      </g>
      {/* Someone walking a dog. */}
      <g transform={`translate(${n1(dx + 346)} ${y + 2})`} stroke={p.ink} strokeWidth={1} fill="none" strokeLinecap="round">
        <circle cx={0} cy={-12.6} r={1.9} fill={p.ink} stroke="none" />
        <path d="M0 -10.4v6M0 -4.4l-2 4.4M0 -4.4l2.2 4.4M0 -9l3.4 2.6l6.6 3" />
        <path d="M10 -3.4h4.6M10.4 -3.4v3.4M14.2 -3.4v3.4M14.6 -3.6l1.6 -1.6" />
      </g>
    </>
  );
}
