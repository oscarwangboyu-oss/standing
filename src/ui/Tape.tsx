import type { ReactNode } from 'react';
import { cx } from './cx';
import type { SectorCode } from './sectors';
import { sectorStyle } from './Tag';
import styles from './Tape.module.css';

/**
 * The one-line market comment: leader, laggard, top gainer, top loser. A sentence in the display
 * face. Set sector codes with <TapeCode> and changes with <Change> inside it.
 */
export function Tape({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx(styles.tape, className)}>{children}</p>;
}

/** A sector code inside the comment, in the sector's colour. */
export function TapeCode({ code }: { code: SectorCode }) {
  return (
    <span className={styles.code} style={sectorStyle(code)}>
      {code}
    </span>
  );
}
