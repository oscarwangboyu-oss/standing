import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { IconChevron } from './icons';
import type { SectorCode } from './sectors';
import { sectorStyle } from './Tag';
import styles from './Entry.module.css';

export interface EntryProps {
  href: string;
  title: ReactNode;
  /** One fact under the title: what it takes or when it is due. */
  detail?: ReactNode;
  /** An icon from the family. It sits on the sector's wash when `sector` is set. */
  icon?: ReactNode;
  /** Colour the icon with a sector: Payday is WLTH, Weekly Win is SKIL, People Nudge is NETW. */
  sector?: SectorCode;
  /** One short status on the right, such as a Tag or "Due today". */
  status?: ReactNode;
  className?: string;
}

/** One way onward from the market home: a row with an icon, a title, one fact and a chevron. */
export function Entry({ href, title, detail, icon, sector, status, className }: EntryProps) {
  return (
    <li className={cx(styles.item, className)} style={sector ? sectorStyle(sector) : undefined}>
      <Link href={href} className={styles.entry}>
        {icon !== undefined && <span className={styles.icon}>{icon}</span>}
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {detail !== undefined && <span className={styles.detail}>{detail}</span>}
        </span>
        {status !== undefined && <span className={styles.status}>{status}</span>}
        <IconChevron className={styles.chevron} size={18} />
      </Link>
    </li>
  );
}

/** A list of entries. Put it in a Card with pad="none". */
export function EntryList({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ul className={cx(styles.list, className)} aria-label={label}>
      {children}
    </ul>
  );
}

export interface FeatureEntryProps {
  href: string;
  /** A short line above the title, such as "Daily Open". */
  eyebrow?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** The label of the pill. */
  action: ReactNode;
  /** An illustration on the right, usually a Spot. */
  art?: ReactNode;
  /** Tint the card with a sector's wash. Default: the sunk ground. */
  sector?: SectorCode;
  className?: string;
}

/** The one thing to do today, as a large tinted card with an illustration. One per screen. */
export function FeatureEntry({ href, eyebrow, title, detail, action, art, sector, className }: FeatureEntryProps) {
  return (
    <Link href={href} className={cx(styles.feature, className)} style={sector ? sectorStyle(sector) : undefined}>
      <span className={styles.featureText}>
        {eyebrow !== undefined && <span className={styles.eyebrow}>{eyebrow}</span>}
        <span className={styles.featureTitle}>{title}</span>
        {detail !== undefined && <span className={styles.featureDetail}>{detail}</span>}
        <span className={styles.featureAction}>
          {action}
          <IconChevron size={16} />
        </span>
      </span>
      {art !== undefined && <span className={styles.art}>{art}</span>}
    </Link>
  );
}
