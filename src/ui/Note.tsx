import type { ReactNode } from 'react';
import { notes } from '@/copy/common';
import { cx } from './cx';
import { IconCare, IconInfo } from './icons';
import styles from './Note.module.css';

export interface NoteProps {
  /**
   * info: a fact about how to read the page. care: the mind notice, calm and at the top of the result.
   * plain: a line of commentary without an icon.
   */
  tone?: 'info' | 'care' | 'plain';
  title?: ReactNode;
  children: ReactNode;
  /** role="note" by default. The mind notice is a region with its title as the name. */
  className?: string;
}

/** A short notice set apart from the content around it. */
export function Note({ tone = 'info', title, children, className }: NoteProps) {
  return (
    <div className={cx(styles.note, styles[tone], className)} role="note">
      {tone !== 'plain' && <span className={styles.icon}>{tone === 'care' ? <IconCare size={20} /> : <IconInfo size={20} />}</span>}
      <div className={styles.text}>
        {title !== undefined && <p className={styles.title}>{title}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

/** The baseline is provisional. This note stays on the result until real data replaces the baseline. */
export function BaselineNote({ className }: { className?: string }) {
  return (
    <Note tone="info" title={notes.baselineTitle} className={className}>
      <p>{notes.baseline}</p>
    </Note>
  );
}
