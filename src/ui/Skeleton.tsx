import type { CSSProperties } from 'react';
import { skeleton as copy } from '@/copy/common';
import { cx } from './cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** Any CSS length. Defaults to the full width. */
  width?: string | number;
  height?: string | number;
  /** The corner radius, for a block that stands in for a card or a pill. */
  radius?: string | number;
  className?: string;
}

/** One still block in the sunk ground colour. Hidden from screen readers. */
export function Skeleton({ width = '100%', height = '1em', radius, className }: SkeletonProps) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius } as CSSProperties} aria-hidden="true" />;
}

/** Lines of text. The last one is shorter. Says "Loading" to screen readers once. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx(styles.stack, className)} role="status">
      <span className="vh">{copy.loading}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cx(styles.skeleton, styles.line)} style={{ width: i === lines - 1 && lines > 1 ? '62%' : '100%' }} aria-hidden="true" />
      ))}
    </div>
  );
}

/** The quote head while the price loads: the same height as the real one, so nothing jumps. */
export function SkeletonQuote({ className }: { className?: string }) {
  return (
    <div className={cx(styles.quote, className)} role="status">
      <span className="vh">{copy.loading}</span>
      <Skeleton width={148} height={30} radius={999} />
      <Skeleton className={styles.quotePrice} width="72%" />
      <Skeleton width={184} height={34} radius={999} />
    </div>
  );
}
