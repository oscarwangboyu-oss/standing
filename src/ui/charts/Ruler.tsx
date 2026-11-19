import type { CSSProperties } from 'react';
import { chart as copy } from '@/copy/common';
import { cx } from '../cx';
import { formatPrice, rulerFraction } from '../format';
import styles from './charts.module.css';

export interface RulerProps {
  /** The price to mark on the scale. */
  value: number;
  className?: string;
}

const TICKS = [55, 70, 85, 100, 115, 130, 145] as const;

/** The full scale, 55 to 145, with one marker. 100 is the median; each step of 15 is one standard deviation. */
export function Ruler({ value, className }: RulerProps) {
  const at = rulerFraction(value);
  return (
    <div className={cx(styles.ruler, className)} role="img" aria-label={copy.ruler(formatPrice(value))}>
      <div className={styles.rulerTrack}>
        <span className={styles.rulerFill} style={{ left: `${Math.min(0.5, at) * 100}%`, width: `${Math.abs(at - 0.5) * 100}%` } as CSSProperties} />
        {TICKS.map((t) => (
          <span key={t} className={cx(styles.rulerTick, t === 100 && styles.rulerTickPar)} style={{ left: `${rulerFraction(t) * 100}%` }} />
        ))}
        <span className={styles.rulerPin} style={{ left: `${at * 100}%` }}>
          <span className={styles.rulerValue}>{formatPrice(value)}</span>
        </span>
      </div>
      <div className={styles.rulerLabels} aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} className={cx(t === 100 && styles.rulerPar)} style={{ left: `${rulerFraction(t) * 100}%` }}>
            {t}
            {t === 100 && <small>{copy.rulerMedian}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}
