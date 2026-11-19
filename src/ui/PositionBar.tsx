import type { CSSProperties } from 'react';
import { board } from '@/copy/common';
import { cx } from './cx';
import { formatPrice, positionBar, positionFraction } from './format';
import styles from './PositionBar.module.css';

export interface PositionBarProps {
  /** The price. The track covers 70 to 130; prices beyond stop at the ends. */
  value: number;
  /** Leave the description out when the row already states the price. */
  quiet?: boolean;
  className?: string;
}

/**
 * Where a price sits against the issue price. The tick in the middle is 100. The bar runs from
 * 100 to the price, in the sector colour when the parent sets one.
 */
export function PositionBar({ value, quiet = false, className }: PositionBarProps) {
  const bar = positionBar(value);
  const at = positionFraction(value);
  return (
    <span className={cx(styles.track, className)} role={quiet ? undefined : 'img'} aria-label={quiet ? undefined : board.position(formatPrice(value))} aria-hidden={quiet || undefined}>
      <span className={styles.fill} style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%` } as CSSProperties} />
      <span className={styles.mid} />
      <span className={styles.dot} style={{ left: `${at * 100}%` }} />
    </span>
  );
}

/** The scale under a group of position bars: 70, 100, 130. */
export function PositionScale({ className }: { className?: string }) {
  return (
    <span className={cx(styles.scale, className)} aria-hidden="true">
      <span>{board.scaleLow}</span>
      <span className={styles.scaleMid}>{board.scaleMid}</span>
      <span>{board.scaleHigh}</span>
    </span>
  );
}
