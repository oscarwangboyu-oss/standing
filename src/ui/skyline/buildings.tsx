/**
 * The five towers. Each one draws itself in its own lot: x from 0 to LOT_W, the street at y = 0,
 * up is negative. `h` is the height of the roof line, which is what the price sets; cranes, domes
 * and flags stand above it. Light comes from the upper left: a lit facet on the front, a shaded
 * side on the right.
 *
 * Each sector has its own architecture, so it can be told apart without colour:
 *   SKIL  a workshop tower with a sawtooth annex and a crane
 *   WLTH  a bank: a portico with columns and a vault door, a stepped crown, a pennant
 *   NETW  two slim towers with slanted roofs, joined by skybridges
 *   BODY  a tower with a climbing wall and a pool that hangs over the edge of the roof
 *   MIND  a tower with a garden terrace and an observatory dome
 */
import type { ReactNode } from 'react';
import type { SectorCode } from '../sectors';
import { FLOOR, hash, n1, windowPaths, type WindowGrid } from './geometry';
import type { SkyPalette, TowerColors } from './palette';

/** 0: a glyph, massing and roof shapes only. 1: windows. 2: every detail. */
export type Detail = 0 | 1 | 2;

export interface TowerProps {
  /** Height of the roof line above the street, in scene units. */
  h: number;
  c: TowerColors;
  p: SkyPalette;
  detail: Detail;
  /** Share of windows with the light on, 0 to 1. */
  lit: number;
  seed: number;
}

const SIDE = 7;

function Windows({ grid, c, p, detail }: { grid: WindowGrid; c: TowerColors; p: SkyPalette; detail: Detail }) {
  if (detail === 0 || grid.top > grid.bottom - grid.pitchY) return null;
  const { glass, lit } = windowPaths(grid);
  return (
    <>
      {glass && <path d={glass} fill={c.W} />}
      {lit && <path d={lit} fill={p.lit} />}
    </>
  );
}

/** A front face, the shaded side to its right and the lit facet at its upper left. */
function Shaft({ x, w, h, c, facet = true, side = SIDE }: { x: number; w: number; h: number; c: TowerColors; facet?: boolean; side?: number }) {
  if (h <= 0) return null;
  const fy = Math.min(h, w * 1.1);
  const fx = w * 0.6 * (fy / (w * 1.1));
  return (
    <>
      <rect x={x} y={n1(-h)} width={w} height={n1(h)} fill={c.F} />
      <path d={`M${x + w} ${n1(-h)}l${side} ${n1(side * 0.6)}V0h${-side}z`} fill={c.S} />
      {facet && <path d={`M${x} ${n1(-h)}h${n1(fx)}L${x} ${n1(-h + fy)}z`} fill={c.L} />}
    </>
  );
}

/* ---------- SKIL: workshop tower ---------- */

export function SkilTower({ h, c, p, detail, lit, seed }: TowerProps) {
  const x = 24;
  const w = 40;
  const t = -h;
  return (
    <>
      {/* The workshop: a low annex with a sawtooth roof. */}
      <path d="M5 0V-15L13 -21V-15L21 -21V-15L29 -21V0z" fill={c.S} />
      <path d="M5 -15L13 -21V-15zM13 -15L21 -21V-15zM21 -15L29 -21V-15z" fill={c.L} />
      {detail > 0 && <rect x={8} y={-10} width={12} height={5} fill={lit > 0.3 ? p.lit : c.W} />}
      <Shaft x={x} w={w} h={h} c={c} />
      <rect x={x} y={n1(t)} width={w} height={2.2} fill={c.L} />
      <Windows grid={{ x: x + 4.6, top: t + 6, bottom: -9, cols: 4, pitchX: 8.4, pitchY: FLOOR, winW: 5.4, winH: 6.2, seed, lit }} c={c} p={p} detail={detail} />
      <rect x={x} y={-3} width={w + SIDE} height={3} fill={c.D} />
      {detail > 0 && <rect x={x + 16} y={-10} width={8} height={10} fill={c.D} />}
      {/* Penthouse and antenna. */}
      <rect x={x + 3} y={n1(t - 6)} width={15} height={6} fill={c.S} />
      <rect x={x + 3} y={n1(t - 6)} width={6} height={6} fill={c.F} />
      {detail > 0 && (
        <>
          <path d={`M${x + 8} ${n1(t - 6)}v-13`} stroke={c.D} strokeWidth={1.1} />
          <circle cx={x + 8} cy={n1(t - 20)} r={1.7} fill={p.flag} />
        </>
      )}
      {/* The tower crane. */}
      <rect x={x + 27.4} y={n1(t - 24)} width={detail === 0 ? 4.4 : 3.2} height={24} fill={p.crane} />
      <rect x={6} y={n1(t - 26)} width={64} height={detail === 0 ? 3.6 : 2.4} fill={p.crane} />
      <rect x={63} y={n1(t - 24)} width={7} height={5.4} fill={c.D} />
      {detail > 0 && (
        <>
          <path d={`M${x + 27.4} ${n1(t - 26)}l1.6 -7l1.6 7z`} fill={p.crane} />
          <path d={`M${x + 29} ${n1(t - 33)}L11 ${n1(t - 26)}M${x + 29} ${n1(t - 33)}L66 ${n1(t - 26)}`} stroke={p.crane} strokeWidth={0.8} fill="none" />
          <rect x={x + 30.6} y={n1(t - 23)} width={4.6} height={4.6} fill={c.D} />
        </>
      )}
      {detail > 1 && (
        <>
          <path d={`M14 ${n1(t - 23.6)}v10.6`} stroke={p.ink} strokeWidth={0.6} />
          <rect x={12.2} y={n1(t - 13)} width={3.6} height={3} fill={p.crane} />
          <path d={`M14 ${n1(t - 10)}l-5 4M14 ${n1(t - 10)}l5 4`} stroke={p.ink} strokeWidth={0.5} fill="none" />
          <rect x={8} y={n1(t - 6)} width={12} height={1.8} fill={c.D} />
          {/* A bird on the jib. */}
          <path d={`M54 ${n1(t - 26)}q0.4 -3.4 3.2 -3.2q1.6 0.1 1.9 1.3l1.5 0.5l-1.6 0.4q-0.5 1 -2 1z`} fill={p.ink} />
        </>
      )}
    </>
  );
}

/* ---------- WLTH: the bank ---------- */

export function WlthTower({ h, c, p, detail, lit, seed }: TowerProps) {
  const x = 15;
  const w = 50;
  const t = -h;
  const crown = h >= 40;
  const poleBase = crown ? t - 10 : -30;
  return (
    <>
      <Shaft x={x} w={w} h={h} c={c} />
      <Windows grid={{ x: x + 5.2, top: t + 6, bottom: -31, cols: 5, pitchX: 8.7, pitchY: FLOOR, winW: 4.6, winH: 8.2, seed, lit }} c={c} p={p} detail={detail} />
      {crown && (
        <>
          <rect x={21} y={n1(t - 5)} width={38} height={5.4} fill={c.F} />
          <rect x={21} y={n1(t - 5)} width={12} height={5.4} fill={c.L} />
          <path d={`M59 ${n1(t - 5)}l5 3V${n1(t + 0.4)}h-5z`} fill={c.S} />
          <rect x={29} y={n1(t - 10)} width={22} height={5.4} fill={c.F} />
          <rect x={29} y={n1(t - 10)} width={7} height={5.4} fill={c.L} />
          <path d={`M51 ${n1(t - 10)}l4 2.4V${n1(t - 4.6)}h-4z`} fill={c.S} />
        </>
      )}
      {/* The portico: steps, columns, the vault door, a pediment. */}
      <rect x={3} y={-3} width={74} height={3} fill={c.S} />
      <rect x={6} y={-5.5} width={68} height={2.5} fill={c.L} />
      <rect x={8} y={-17} width={64} height={11.5} fill={c.D} />
      {detail > 0 && (
        <>
          <circle cx={40} cy={-11.2} r={5} fill={c.S} stroke={p.stone} strokeWidth={0.9} />
          {detail > 1 && <path d="M40 -14.6v6.8M36.6 -11.2h6.8" stroke={p.stone} strokeWidth={0.8} />}
          <circle cx={40} cy={-11.2} r={1.2} fill={p.stone} />
        </>
      )}
      <path d="M9 -17h4.2v11.5H9zM18.2 -17h4.2v11.5h-4.2zM27.4 -17h4.2v11.5h-4.2zM48.4 -17h4.2v11.5h-4.2zM57.6 -17h4.2v11.5h-4.2zM66.8 -17H71v11.5h-4.2z" fill={p.stone} />
      <rect x={5} y={-20} width={70} height={3} fill={p.stone} />
      <path d="M5 -20L40 -30L75 -20z" fill={c.L} />
      {detail > 0 && <path d="M14 -21.2L40 -28.4L66 -21.2z" fill={c.F} />}
      {detail > 0 && <circle cx={40} cy={-23.8} r={1.7} fill={p.stone} />}
      {/* The pennant. */}
      <path d={`M40 ${n1(poleBase)}v-14`} stroke={c.D} strokeWidth={detail === 0 ? 2 : 1.1} />
      <path d={`M40.5 ${n1(poleBase - 14)}l9 3l-9 3z`} fill={p.flag} />
    </>
  );
}

/* ---------- NETW: twin towers and skybridges ---------- */

export function NetwTower({ h, c, p, detail, lit, seed }: TowerProps) {
  const hA = h;
  const hB = Math.max(18, h - 14);
  const side = 5;
  const bridges = hB >= 62 ? [hB * 0.44, hB * 0.76] : hB >= 26 ? [Math.max(13, hB * 0.58)] : [];
  const glass = lit > 0.3 ? p.lit : c.W;
  return (
    <>
      <rect x={4} y={-7} width={72} height={7} fill={c.D} />
      {/* Tower A: the taller one carries the price. */}
      <path d={`M8 0V${n1(-hA + 7)}L33 ${n1(-hA)}V0z`} fill={c.F} />
      <path d={`M33 ${n1(-hA)}l${side} 3V0h${-side}z`} fill={c.S} />
      {hA > 34 && <path d={`M8 ${n1(-hA + 7)}L22 ${n1(-hA + 3.1)}L8 ${n1(-hA + 27)}z`} fill={c.L} />}
      <Windows grid={{ x: 12.4, top: -hA + 12, bottom: -9, cols: 2, pitchX: 9.6, pitchY: FLOOR, winW: 6.6, winH: 6.2, seed, lit }} c={c} p={p} detail={detail} />
      {/* Tower B. */}
      <path d={`M44 0V${n1(-hB)}L69 ${n1(-hB + 7)}V0z`} fill={c.F} />
      <path d={`M69 ${n1(-hB + 7)}l${side} 3V0h${-side}z`} fill={c.S} />
      {hB > 34 && <path d={`M44 ${n1(-hB)}L57 ${n1(-hB + 3.6)}L44 ${n1(-hB + 20)}z`} fill={c.L} />}
      <Windows grid={{ x: 48.4, top: -hB + 12, bottom: -9, cols: 2, pitchX: 9.6, pitchY: FLOOR, winW: 6.6, winH: 6.2, seed: seed + 3, lit }} c={c} p={p} detail={detail} />
      {/* Skybridges. */}
      {bridges.map((b) => (
        <g key={b}>
          <rect x={33} y={n1(-b - 1.2)} width={11} height={7.4} fill={c.D} />
          <rect x={33} y={n1(-b)} width={11} height={5} fill={glass} />
        </g>
      ))}
      {detail > 0 && (
        <>
          <rect x={17} y={-6} width={7} height={6} fill={c.W} />
          <rect x={53} y={-6} width={7} height={6} fill={c.W} />
        </>
      )}
      {/* Masts. */}
      <path d={`M30 ${n1(-hA + 0.8)}v${detail === 0 ? -12 : -15}`} stroke={c.D} strokeWidth={detail === 0 ? 2.4 : 1.1} />
      <path d={`M47 ${n1(-hB + 0.8)}v${detail === 0 ? -9 : -11}`} stroke={c.D} strokeWidth={detail === 0 ? 2.4 : 1.1} />
      {detail > 0 && (
        <>
          <circle cx={30} cy={n1(-hA - 15)} r={1.6} fill={p.flag} />
          <circle cx={47} cy={n1(-hB - 11)} r={1.4} fill={p.flag} />
          <path d={`M44.4 ${n1(-hB - 7)}h5.2M45.3 ${n1(-hB - 4.4)}h3.4`} stroke={c.D} strokeWidth={0.9} />
          <path d={`M25.6 ${n1(-hA - 6)}a4.2 4.2 0 0 0 7.4 3z`} fill={c.W} />
        </>
      )}
      {detail > 1 && (
        <path
          d={`M33.4 ${n1(-hA - 18)}a4.4 4.4 0 0 1 0 6M36.2 ${n1(-hA - 20.2)}a7.6 7.6 0 0 1 0 10.4`}
          stroke={c.L}
          strokeWidth={0.9}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </>
  );
}

/* ---------- BODY: climbing wall and rooftop pool ---------- */

export function BodyTower({ h, c, p, detail, lit, seed }: TowerProps) {
  const x = 10;
  const w = 46;
  const t = -h;
  const wall = h > 44;
  const holds: ReactNode[] = [];
  if (wall && detail > 1) {
    const colours = [p.crane, p.pool, c.D, p.tree];
    const n = Math.floor((h - 24) / 6);
    for (let i = 0; i < n; i++) {
      holds.push(<circle key={i} cx={n1(x + 2.4 + hash(seed, i) * 7.2)} cy={n1(-14 - i * 6 - hash(seed + 1, i) * 2)} r={0.95} fill={colours[i % 4] as string} />);
    }
  }
  const cy = t + 8 + (h - 20) * 0.36;
  return (
    <>
      <Shaft x={x} w={w} h={h} c={c} facet={!wall} />
      {wall && <rect x={x} y={n1(t + 8)} width={12} height={n1(h - 20)} fill={p.wall} />}
      {holds}
      {wall && detail > 1 && (
        <>
          <path d={`M16 ${n1(t + 8)}V${n1(cy - 1.6)}`} stroke={p.ink} strokeWidth={0.45} opacity={0.6} />
          <circle cx={16} cy={n1(cy)} r={1.6} fill={p.ink} />
          <path
            d={`M16 ${n1(cy + 1.6)}v4.4M16 ${n1(cy + 2.6)}l-2.7 -2.5M16 ${n1(cy + 2.9)}l2.9 -1.5M16 ${n1(cy + 6)}l-2.1 3M16 ${n1(cy + 6)}l2.3 2.3`}
            stroke={p.ink}
            strokeWidth={0.95}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
      <Windows grid={{ x: x + 16.6, top: t + 7, bottom: -20, cols: 3, pitchX: 9.5, pitchY: FLOOR, winW: 6.6, winH: 6.2, seed, lit }} c={c} p={p} detail={detail} />
      {detail > 0 && (
        <>
          {/* The gym on the ground floor. */}
          <rect x={x + 16} y={-15.5} width={26} height={10.5} fill={lit > 0.3 ? p.lit : c.W} />
          <path d="M31 -10.2h16" stroke={c.D} strokeWidth={1} />
          <path d="M30 -13h2.2v5.6H30zM45.8 -13H48v5.6h-2.2z" fill={c.D} />
          <rect x={x + 3} y={-9} width={6} height={9} fill={c.D} />
        </>
      )}
      <rect x={x} y={-2.6} width={w + SIDE} height={2.6} fill={c.D} />
      {/* The roof deck and the pool that hangs over the edge. */}
      <rect x={x - 2} y={n1(t - 2.2)} width={69} height={2.6} fill={c.D} />
      <rect x={38} y={n1(t - 9)} width={39} height={6.8} fill={p.pool} />
      <rect x={38} y={n1(t - 9)} width={39} height={2} fill={p.pool2} />
      <path d={`M63 ${n1(t + 0.4)}h13l-13 9z`} fill={c.S} />
      {detail > 0 && (
        <>
          <path d={`M21 ${n1(t - 2.2)}v-10`} stroke={c.D} strokeWidth={0.9} />
          <path d={`M13.4 ${n1(t - 11)}q7.6 -6.4 15.2 0z`} fill={p.crane} />
        </>
      )}
      {detail > 1 && (
        <>
          <circle cx={58} cy={n1(t - 8.4)} r={1.5} fill={p.ink} />
          <path d={`M60 ${n1(t - 8.2)}l3.2 -1.8`} stroke={p.ink} strokeWidth={0.9} strokeLinecap="round" />
          <rect x={24.5} y={n1(t - 4.6)} width={7} height={1.3} fill={p.cloud} />
        </>
      )}
    </>
  );
}

/* ---------- MIND: garden terrace and observatory ---------- */

export function MindTower({ h, c, p, detail, lit, seed }: TowerProps) {
  const x = 12;
  const w = 48;
  const t = -h;
  const setback = h >= 70;
  const upper = setback ? Math.min(46, Math.max(28, h * 0.38)) : 0;
  const hl = h - upper;
  const rowsBelow = Math.ceil((hl - 7) / FLOOR);
  const round = setback && upper >= 30 && detail > 0;
  return (
    <>
      {setback ? (
        <>
          <Shaft x={x} w={w} h={hl} c={c} side={0} />
          <rect x={26} y={n1(t)} width={34} height={n1(upper)} fill={c.F} />
          <path d={`M26 ${n1(t)}h20L26 ${n1(t + 22)}z`} fill={c.L} />
          <path d={`M60 ${n1(t)}l${SIDE} ${n1(SIDE * 0.6)}V0h${-SIDE}z`} fill={c.S} />
        </>
      ) : (
        <Shaft x={x} w={w} h={h} c={c} />
      )}
      <Windows grid={{ x: x + 4.4, top: -hl + 6, bottom: -9, cols: 5, pitchX: 8.6, pitchY: FLOOR, winW: 5.4, winH: 6.2, seed, lit }} c={c} p={p} detail={detail} />
      {setback && (
        <Windows
          grid={{ x: 30.4, top: t + (round ? 23 : 7), bottom: -9 - rowsBelow * FLOOR, cols: 3, pitchX: 9.4, pitchY: FLOOR, winW: 6.2, winH: 6.2, seed: seed + 5, lit }}
          c={c}
          p={p}
          detail={detail}
        />
      )}
      {round && (
        <>
          <circle cx={43} cy={n1(t + 12.6)} r={6.6} fill={c.L} />
          <circle cx={43} cy={n1(t + 12.6)} r={5} fill={lit > 0.3 ? p.lit : c.W} />
          {detail > 1 && <path d={`M43 ${n1(t + 7.6)}v10M38 ${n1(t + 12.6)}h10`} stroke={c.F} strokeWidth={0.8} />}
        </>
      )}
      <rect x={x} y={-2.6} width={w + SIDE} height={2.6} fill={c.D} />
      {detail > 0 && <path d="M32 0v-8.4a4.2 4.2 0 0 1 8.4 0V0z" fill={c.D} />}
      {/* The terrace garden. */}
      {setback && (
        <>
          <rect x={11} y={n1(-hl - 2.4)} width={15} height={2.6} fill={c.D} />
          <circle cx={16.4} cy={n1(-hl - 7.4)} r={4.8} fill={p.tree} />
          <circle cx={22.6} cy={n1(-hl - 5.6)} r={3.5} fill={p.tree2} />
          {detail > 1 && <path d={`M13 ${n1(-hl)}h1.7v7H13zM17.4 ${n1(-hl)}h1.7v4.4h-1.7zM21.6 ${n1(-hl)}h1.7v9h-1.7z`} fill={p.tree} />}
        </>
      )}
      {/* The roof: a tree and the observatory. */}
      <rect x={setback ? 25 : 11} y={n1(t - 2.2)} width={setback ? 36 : 50} height={2.6} fill={c.D} />
      <circle cx={setback ? 31.5 : 21} cy={n1(t - 7)} r={4.4} fill={p.tree} />
      {!setback && <circle cx={28} cy={n1(t - 5.4)} r={3.2} fill={p.tree2} />}
      <rect x={38} y={n1(t - 5)} width={18} height={3} fill={c.S} />
      <path d={`M37 ${n1(t - 5)}a10 10 0 0 1 20 0z`} fill={p.dome} />
      <path d={`M46.4 ${n1(t - 15)}h2.6l3 10h-3.8z`} fill={c.D} />
      {detail > 0 && <path d={`M48.6 ${n1(t - 10)}l6.2 -7.4`} stroke={c.D} strokeWidth={1.6} strokeLinecap="round" />}
    </>
  );
}

export const TOWERS: Record<SectorCode, (props: TowerProps) => ReactNode> = {
  SKIL: SkilTower,
  WLTH: WlthTower,
  NETW: NetwTower,
  BODY: BodyTower,
  MIND: MindTower,
};

/* ---------- Lots without a tower ---------- */

/** Not listed: a fenced lot with a sign and a young tree. It claims no height. */
export function EmptyLot({ p, detail }: { p: SkyPalette; detail: Detail }) {
  return (
    <>
      <rect x={12} y={-8} width={56} height={8} fill={p.ghost} opacity={0.4} />
      <path d="M12 -8h56" stroke={p.ghost} strokeWidth={1.4} />
      {detail > 0 && (
        <>
          <path d="M19 -8V0M26 -8V0M33 -8V0M40 -8V0M47 -8V0M54 -8V0M61 -8V0" stroke={p.ghost} strokeWidth={0.8} />
          <path d="M52 -8v-12" stroke={p.trunk} strokeWidth={1.1} />
          <circle cx={52} cy={-22} r={4.4} fill={p.tree} />
          <path d="M28 -8v-9" stroke={p.ghost} strokeWidth={1.2} />
          <rect x={21} y={-25} width={14} height={9} rx={1.5} fill={p.path} stroke={p.ghost} strokeWidth={0.9} />
        </>
      )}
    </>
  );
}

/** Not enough data: a frame under scaffolding, two floors poured. It claims no height. */
export function Scaffold({ p, detail }: { p: SkyPalette; detail: Detail }) {
  return (
    <>
      <rect x={18} y={-22} width={44} height={22} fill={p.ghost} opacity={0.55} />
      <path
        d="M18 -22V-58M29 -22V-58M40 -22V-58M51 -22V-58M62 -22V-58M18 -34h44M18 -46h44M18 -58h44"
        stroke={p.ghost}
        strokeWidth={detail === 0 ? 2.4 : 1.1}
        fill="none"
      />
      {detail > 0 && (
        <>
          <path d="M18 -34L29 -46M29 -34L40 -46M40 -34L51 -46M51 -34L62 -46" stroke={p.ghost} strokeWidth={0.7} />
          <path d="M22 -11h36" stroke={p.path} strokeWidth={1} />
          <rect x={36} y={-9} width={8} height={9} fill={p.ground2} />
        </>
      )}
    </>
  );
}

/** Halted: a barrier across the door. The tower itself is drawn dimmed, with the lights out. */
export function Barrier({ p }: { p: SkyPalette }) {
  return (
    <>
      <rect x={24} y={-8} width={32} height={4.4} rx={0.8} fill={p.crane} />
      <path d="M28 -8l-3 4.4M35 -8l-3 4.4M42 -8l-3 4.4M49 -8l-3 4.4M56 -8l-3 4.4" stroke={p.ink} strokeWidth={1.3} />
      <path d="M27 -3.6V0M53 -3.6V0" stroke={p.ink} strokeWidth={1.2} />
    </>
  );
}
