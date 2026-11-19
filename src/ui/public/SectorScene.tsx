import { useId } from 'react';
import { cx } from '../cx';
import type { SectorCode } from '../sectors';
import { TOWERS } from '../skyline/buildings';
import { hash, n1 } from '../skyline/geometry';
import { SKY_VARS, towerColors } from '../skyline/palette';
import styles from './scenes.module.css';

export interface SectorSceneProps {
  code: SectorCode;
  /** Height of the roof line in scene units. A complete building at any height. */
  h?: number;
  className?: string;
}

const P = SKY_VARS;

function Tree({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 258) scale(${s})`}>
      <rect x={-1.2} y={-13} width={2.4} height={13} fill={P.trunk} />
      <circle cx={0} cy={-20} r={9.5} fill={P.tree} />
      <circle cx={3} cy={-17} r={6.2} fill={P.tree2} />
    </g>
  );
}

/** A soft cloud on the sector tint. */
function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--sector-wash)">
      <rect x={0} y={0} width={44} height={11} rx={5.5} />
      <rect x={10} y={-8} width={24} height={14} rx={7} />
    </g>
  );
}

/**
 * One sector's building, large, in an arched window on the sector's tint. Decoration for the
 * sector bands of the landing page: the text next to it says what the sector is. Use it inside
 * an element with sectorStyle(code).
 */
export function SectorScene({ code, h = 112, className }: SectorSceneProps) {
  const clip = useId();
  const Tower = TOWERS[code];
  const seed = code.charCodeAt(0) + code.charCodeAt(1);
  // A row of low blocks behind the tower, in the sector colour, so the building stands in a street.
  const blocks: string[] = [];
  let x = -6;
  for (let i = 0; x < 240; i++) {
    const w = 22 + Math.round(hash(seed, i) * 20);
    const bh = 26 + Math.round(hash(seed + 5, i) * 44);
    blocks.push(`M${x} 252v${-bh}h${w}v${bh}z`);
    x += w + 3;
  }
  return (
    <svg className={cx(styles.sector, className)} viewBox="0 0 240 300" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <path d="M0 276V120A120 120 0 0 1 240 120V276A24 24 0 0 1 216 300H24A24 24 0 0 1 0 276z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={240} height={300} fill="var(--sector-tint)" />
        <circle cx={182} cy={84} r={40} fill={P.halo} opacity={0.5} />
        <circle cx={182} cy={84} r={24} fill={P.sun} />
        <Cloud x={22} y={96} />
        <Cloud x={150} y={136} s={0.7} />
        <path d={blocks.join('')} fill="var(--sector)" opacity={0.22} />
        <rect y={252} width={240} height={48} fill={P.ground} />
        <rect y={252} width={240} height={3} fill={P.ground2} />
        <path d="M0 280H240" stroke={P.path} strokeWidth={2.6} strokeDasharray="16 12" />
        <path d={`M66 255h${n1(96)}l14 10H80z`} fill={P.ground2} opacity={0.55} />
        <g transform="translate(60 252) scale(1.5)">
          <Tower h={h} c={towerColors(P, code)} p={P} detail={2} lit={0.42} seed={seed} />
        </g>
        <Tree x={34} />
        <Tree x={208} s={0.82} />
      </g>
    </svg>
  );
}
