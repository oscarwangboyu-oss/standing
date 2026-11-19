import type { CSSProperties } from 'react';
import { cx } from '../cx';
import { type SectorCode } from '../sectors';
import { TOWERS } from './buildings';
import { SKY_VARS, towerColors } from './palette';
import styles from './emblem.module.css';

export interface TypeEmblemProps {
  /** The two highest sectors. The first is drawn taller. */
  pair: readonly [SectorCode, SectorCode];
  /** Width and height in px. Default 96. */
  size?: number;
  className?: string;
}

const wash = (code: SectorCode) => `var(--${code.toLowerCase()}-tint)`;

/**
 * The emblem of a type: the two sector buildings side by side on one street, each on its own
 * colour. Decoration: the type name next to it carries the meaning.
 */
export function TypeEmblem({ pair, size = 96, className }: TypeEmblemProps) {
  const [a, b] = pair;
  const A = TOWERS[a];
  const B = TOWERS[b];
  const p = SKY_VARS;
  const s = 0.56;
  return (
    <svg
      className={cx(styles.emblem, className)}
      style={{ width: size, height: size } as CSSProperties}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={96} height={96} fill={wash(a)} />
      <path d="M58 0h38v96H38z" fill={wash(b)} />
      <circle cx={76} cy={20} r={8} fill="var(--surface)" opacity={0.7} />
      <rect y={80} width={96} height={16} fill={p.ground} />
      <rect y={80} width={96} height={1.6} fill={p.ground2} />
      <g transform={`translate(3 80) scale(${s})`}>
        <A h={112} c={towerColors(p, a)} p={p} detail={1} lit={0.3} seed={3} />
      </g>
      <g transform={`translate(48 80) scale(${s})`}>
        <B h={84} c={towerColors(p, b)} p={p} detail={1} lit={0.3} seed={9} />
      </g>
    </svg>
  );
}
