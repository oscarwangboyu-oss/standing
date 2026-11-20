import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './StatStrip.module.css';

export interface Stat {
  label: ReactNode;
  value: ReactNode;
}

export interface StatStripProps {
  /** Usually four: issue price, all-time high, all-time low, data grade. */
  stats: readonly Stat[];
  className?: string;
}

/** A row of labelled figures under the quote. Four: two by two on a narrow phone, one row from 440px. Three or fewer: one row. */
export function StatStrip({ stats, className }: StatStripProps) {
  return (
    <dl className={cx(styles.strip, className)} data-count={stats.length}>
      {stats.map((s, i) => (
        <div key={i} className={styles.stat}>
          <dt className={styles.label}>{s.label}</dt>
          <dd className={styles.value}>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
