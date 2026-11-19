import type { CSSProperties } from 'react';
import { cx } from '../cx';
import type { SectorCode } from '../sectors';
import { TOWERS } from '../skyline/buildings';
import { LOT_W, n1, towerHeight } from '../skyline/geometry';
import { SKY_VARS, towerColors } from '../skyline/palette';
import { MOON } from '../skyline/scenery';
import styles from './page.module.css';

export interface MastTower {
  code: SectorCode;
  price: number;
}

export interface MastSceneProps {
  /** The towers, left to right. Each stands at the height of its price, on the scale of every skyline. */
  towers: readonly MastTower[];
  /** Draw the horizon at 100 with its tag, and print each price above its roof. */
  scale?: boolean;
  className?: string;
}

/** Height of the scene in units: the sky, then the street. */
export const MAST_H = 226;
/** Height of the street inside the scene. The page continues it to both edges. */
export const MAST_STREET = 28;
const G = MAST_H - MAST_STREET;
const PAD = 26;
const P = SKY_VARS;

/**
 * A few towers on the street at the foot of a page heading. Decoration: the same buildings, on
 * the same scale, as every skyline in the product. With `scale` it also shows how a price is read.
 */
export function MastScene({ towers, scale = false, className }: MastSceneProps) {
  const w = PAD * 2 + towers.length * LOT_W;
  const horizon = G - towerHeight(100);
  const shortest = towers.reduce((at, t, i) => (t.price < (towers[at]?.price ?? Infinity) ? i : at), 0);
  const tallest = towers.reduce((at, t, i) => (t.price > (towers[at]?.price ?? -Infinity) ? i : at), 0);
  const sunX = PAD + shortest * LOT_W + LOT_W / 2 + 4;
  const sunY = Math.max(34, Math.min(G - towerHeight(towers[shortest]?.price ?? 100) - 58, scale ? horizon - 44 : G));
  // The cloud drifts over a lot that holds neither the sun nor the tallest tower's roof gear.
  const free = towers.findIndex((_, i) => i !== shortest && i !== tallest);
  const cloudX = free >= 0 ? PAD + free * LOT_W + 12 : shortest === 0 ? w - 60 : 6;
  return (
    <svg
      className={cx(styles.mastScene, className)}
      viewBox={`0 0 ${w} ${MAST_H}`}
      style={{ '--scene-ratio': n1(w / MAST_H) } as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      {/* The sun by day, the moon by night: above the shortest tower, so no tower hides it. */}
      <g style={{ opacity: P.dayOn }}>
        <circle cx={sunX} cy={sunY} r={30} fill={P.halo} opacity={0.5} />
        <circle cx={sunX} cy={sunY} r={18} fill={P.sun} />
      </g>
      <g style={{ opacity: P.nightOn }} transform={`translate(${sunX} ${sunY}) scale(1.5)`}>
        <path d={MOON} fill={P.sun} />
      </g>
      <g fill={P.cloud} transform={`translate(${cloudX} 0)`}>
        <rect x={0} y={34} width={46} height={11} rx={5.5} />
        <rect x={10} y={26} width={24} height={14} rx={7} />
      </g>

      {scale && <path d={`M0 ${n1(horizon)}H${w}`} stroke={P.ink} strokeWidth={1.4} strokeDasharray="6 5" opacity={0.7} />}

      {towers.map((t, i) => {
        const Tower = TOWERS[t.code];
        const x = PAD + i * LOT_W;
        const h = towerHeight(t.price);
        return (
          <g key={`${t.code}-${i}`}>
            <path d={`M${x + 24} ${G + 2}h47l10 7h-47z`} fill={P.ground2} opacity={0.6} />
            <g transform={`translate(${x} ${G})`}>
              <Tower h={h} c={towerColors(P, t.code)} p={P} detail={2} lit={0.45} seed={13 + i * 7} />
            </g>
          </g>
        );
      })}

      {/* Street trees between the lots. */}
      {towers.map((_, i) => (
        <g key={i} transform={`translate(${PAD + i * LOT_W + 4} ${G})`}>
          <rect x={-0.9} y={-9} width={1.8} height={9} fill={P.trunk} />
          <circle cx={0} cy={-13} r={6} fill={P.tree} />
          <circle cx={1.8} cy={-11.4} r={3.8} fill={P.tree2} />
        </g>
      ))}

      {scale && (
        <>
          <rect x={2} y={n1(horizon - 9)} width={34} height={18} rx={9} fill={P.ink} />
          <text x={19} y={n1(horizon + 4)} textAnchor="middle" className={styles.mastPillText}>
            100
          </text>
        </>
      )}
    </svg>
  );
}
