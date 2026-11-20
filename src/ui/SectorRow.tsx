import type { ReactNode } from 'react';
import { board, quote, sectorNames } from '@/copy/common';
import { Change } from './Change';
import { Sparkline } from './charts/Sparkline';
import type { Domain } from './charts/scale';
import { cx } from './cx';
import { IconChevron } from './icons';
import { PositionBar, PositionScale } from './PositionBar';
import { Price } from './Price';
import type { SectorCode, SectorTagKind } from './sectors';
import { SectorGlyph } from './skyline/SectorGlyph';
import { Tag, sectorStyle } from './Tag';
import styles from './SectorRow.module.css';

export interface SectorRowProps {
  code: SectorCode;
  /** null when the sector has no price. */
  price: number | null;
  /** The change since the last record. null on the first record. */
  change?: number | null;
  /** listed, or why there is no price, or halted (the price stands still). */
  status?: 'listed' | 'insufficient' | 'unlisted' | 'halted';
  /** At most one market tag: leader, laggard, limit up, limit down, halted, resumed. */
  tag?: SectorTagKind | null;
  /** Recent records, oldest first, for the sparkline. */
  history?: readonly number[];
  /** One domain for all rows of a board, from sharedDomain. */
  domain?: Domain;
  /** Makes the row a button, for the sheet with the sector's breakdown. */
  onSelect?: () => void;
  /** Extra content under the row, such as one line of explanation. */
  children?: ReactNode;
  className?: string;
}

/**
 * One sector in a board: its building and ticker in its colour, a sparkline, the price, the
 * change, and the position against the issue price. A sector without a price says why.
 */
export function SectorRow({ code, price, change, status = price === null ? 'insufficient' : 'listed', tag, history, domain, onSelect, children, className }: SectorRowProps) {
  const hasPrice = price !== null && (status === 'listed' || status === 'halted');
  // BODY and MIND are already their own names: "BODY Body" would say the same word twice.
  const name = sectorNames[code].toUpperCase() === code ? null : sectorNames[code];
  // The tag sits next to the code, so every position bar below spans the same width and the
  // 100 tick lines up with the scale under the board.
  const marketTag = hasPrice && tag && tag !== 'halted' ? <Tag kind={tag} /> : null;
  const body = (
    <>
      <span className={styles.chip}>
        <SectorGlyph code={code} size={22} />
      </span>
      <span className={cx(styles.id, name === null && styles.idSolo)}>
        <span className={styles.codeLine}>
          <span className={styles.code}>{code}</span>
          {marketTag}
        </span>
        {name !== null && <span className={styles.name}>{name}</span>}
      </span>
      {hasPrice ? (
        <>
          <span className={styles.spark}>{history && history.length > 1 && <Sparkline values={history} domain={domain} label={board.history(sectorNames[code])} />}</span>
          <span className={styles.nums}>
            <Price value={price} size="md" />
            {change !== undefined && change !== null && status !== 'halted' && <Change value={change} size="sm" />}
            {status === 'halted' && <Tag kind="halted" />}
          </span>
        </>
      ) : (
        <span className={styles.none}>{status === 'unlisted' ? quote.notListed : quote.notEnoughData}</span>
      )}
      {onSelect && <IconChevron className={styles.chevron} size={18} />}
    </>
  );
  return (
    <li className={cx(styles.row, status === 'halted' && styles.halted, className)} style={sectorStyle(code)}>
      {onSelect ? (
        <button type="button" className={styles.main} onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className={styles.main}>{body}</div>
      )}
      {hasPrice && (
        <div className={styles.under}>
          <PositionBar value={price} quiet />
        </div>
      )}
      {children !== undefined && <div className={styles.extra}>{children}</div>}
    </li>
  );
}

export interface SectorBoardProps {
  /** Accessible name of the list. */
  label: string;
  children: ReactNode;
  /** Print the 70, 100, 130 scale under the rows. Default on. */
  scale?: boolean;
  className?: string;
}

/** The list of sector rows. Put it in a Card. */
export function SectorBoard({ label, children, scale = true, className }: SectorBoardProps) {
  return (
    <div className={cx(styles.board, className)}>
      <ul className={styles.list} aria-label={label}>
        {children}
      </ul>
      {scale && (
        <div className={styles.scale}>
          <PositionScale />
        </div>
      )}
    </div>
  );
}
