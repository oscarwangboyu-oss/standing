import type { CSSProperties } from 'react';
import { progress } from '@/copy/common';
import { cx } from './cx';
import styles from './ProgressTape.module.css';

export interface ProgressTapeProps {
  /** Number of steps. */
  total: number;
  /** The step on screen, counted from 1. */
  current: number;
  className?: string;
}

/**
 * Progress for a short flow where a skyline would be too much: the three questions of the Daily
 * Open, the steps of the first Payday setup. One pill per step. The check uses the skyline and
 * ProgressCount instead.
 */
export function ProgressTape({ total, current, className }: ProgressTapeProps) {
  const now = Math.min(Math.max(1, current), Math.max(1, total));
  return (
    <div
      className={cx(styles.tape, className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={now}
      aria-label={progress.position(now, total)}
      style={{ '--n': total } as CSSProperties}
    >
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={cx(styles.step, i + 1 < now && styles.done, i + 1 === now && styles.now)} />
      ))}
    </div>
  );
}
