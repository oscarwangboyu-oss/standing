import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cx } from './cx';
import type { SectorCode } from './sectors';
import styles from './Band.module.css';

export interface BandProps {
  /** A sector's wash, the sunk ground, or ink (the dark band at the end of a public page). */
  tone?: SectorCode | 'sunk' | 'ink';
  /** Cap the content at the app column (560px) or the wide column (1120px). */
  width?: 'col' | 'wide';
  as?: ElementType;
  id?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A full-width tinted section. Its top edge is a skyline silhouette instead of a straight line,
 * so a page reads as one city from top to bottom. Bands follow each other without a gap.
 */
export function Band({ tone = 'sunk', width = 'wide', as: Tag = 'section', id, children, className }: BandProps) {
  const fill = tone === 'sunk' ? 'var(--ground-2)' : tone === 'ink' ? 'var(--ink)' : `var(--${tone.toLowerCase()}-wash)`;
  return (
    <Tag id={id} className={cx(styles.band, tone === 'ink' && styles.ink, className)} style={{ '--band': fill } as CSSProperties}>
      <div className={cx(styles.inner, styles[width])}>{children}</div>
    </Tag>
  );
}
