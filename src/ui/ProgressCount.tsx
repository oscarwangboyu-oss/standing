import { progress, sectorNames } from '@/copy/common';
import { cx } from './cx';
import type { SectorCode } from './sectors';
import { SectorTag } from './Tag';
import styles from './ProgressCount.module.css';

export interface ProgressCountProps {
  /** The number of the question on screen, from 1. */
  current: number;
  total: number;
  /** The sector of the question, shown as its tag. */
  sector?: SectorCode;
  /** Position inside the sector, when known: "3 of 5 in Body". */
  inSector?: { current: number; total: number };
  className?: string;
}

/**
 * The plain count that goes with the building-floors progress: "Question 25 of 34". The skyline
 * shows the same progress as towers; this line says it in words and numbers.
 */
export function ProgressCount({ current, total, sector, inSector, className }: ProgressCountProps) {
  return (
    <div className={cx(styles.count, className)}>
      {sector && <SectorTag code={sector} name />}
      <p className={styles.text} aria-live="polite">
        <span className={styles.main}>{progress.position(current, total)}</span>
        {sector && inSector && <span className={styles.sub}>{progress.inSector(inSector.current, inSector.total, sectorNames[sector])}</span>}
      </p>
    </div>
  );
}
