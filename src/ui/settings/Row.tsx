import type { ReactNode } from 'react';
import { IconChevron } from '@/ui';
import styles from './settings.module.css';

export interface ActionRowProps {
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Announced while the action runs. */
  busy?: boolean;
}

/**
 * A row that does something on this screen, where `Entry` of the design system leads to
 * another screen. Same measures as an Entry: an icon chip, a title, one fact, a chevron.
 */
export function ActionRow({ title, detail, icon, onClick, disabled = false, busy = false }: ActionRowProps) {
  return (
    <li className={styles.rowItem}>
      <button type="button" className={styles.row} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
        {icon !== undefined && <span className={styles.rowIcon}>{icon}</span>}
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {detail !== undefined && <span className={styles.rowDetail}>{detail}</span>}
        </span>
        <IconChevron className={styles.rowChevron} size={18} />
      </button>
    </li>
  );
}

/** A list of action rows. Put it in a Card with pad="none". */
export function ActionList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.rows} aria-label={label}>
      {children}
    </ul>
  );
}
