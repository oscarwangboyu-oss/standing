import type { ReactNode } from 'react';
import { sectorNames, typeCard as copy } from '@/copy/common';
import { typeForPair, type TypeEntry } from '@/copy/types';
import { cx } from './cx';
import type { SectorCode } from './sectors';
import { TypeEmblem } from './skyline/TypeEmblem';
import { SectorTag } from './Tag';
import styles from './TypeCard.module.css';

export interface TypeCardProps {
  /** The two highest sectors, highest first. */
  pair: readonly [SectorCode, SectorCode];
  /** Override the entry from src/copy/types.ts. */
  entry?: TypeEntry;
  /** compact: emblem and name in one row, for lists and the compare view. */
  compact?: boolean;
  /** The heading level of the name. Default h3. */
  as?: 'h2' | 'h3' | 'p';
  children?: ReactNode;
  className?: string;
}

/** A type: its emblem, its name, one line that leads with the strengths, and the two sectors it is made of. */
export function TypeCard({ pair, entry, compact = false, as: Heading = 'h3', children, className }: TypeCardProps) {
  const type = entry ?? typeForPair(pair[0], pair[1]);
  if (!type) return null;
  return (
    <article className={cx(styles.card, compact && styles.compact, className)}>
      <TypeEmblem pair={pair} size={compact ? 56 : 104} />
      <div className={styles.head}>
        {!compact && <p className={styles.label}>{copy.label}</p>}
        <Heading className={styles.name}>{type.name}</Heading>
      </div>
      <div className={styles.text}>
        {!compact && <p className={styles.line}>{type.line}</p>}
        <p className={styles.tags}>
          <SectorTag code={pair[0]} size="sm" />
          <SectorTag code={pair[1]} size="sm" />
          <span className="vh">{copy.pair(sectorNames[pair[0]], sectorNames[pair[1]])}</span>
        </p>
        {children}
      </div>
    </article>
  );
}
