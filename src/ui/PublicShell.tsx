import type { ReactNode } from 'react';
import { TopBar } from './AppShell';
import { cx } from './cx';
import { Footer } from './Footer';
import styles from './Shell.module.css';

export interface PublicShellProps {
  /** One control on the right of the top bar, usually the primary action as a small button. */
  headerRight?: ReactNode;
  /** Show the footer. On by default: public pages carry the required statements. */
  footer?: boolean;
  /** Links in the footer, such as the privacy notice and the terms. */
  footerLinks?: ReadonlyArray<{ href: string; label: string }>;
  /**
   * bleed: children run the full width, and each section caps itself (use Band, or the
   * `publicColumn` class from Shell.module.css through the Column component).
   * column: children sit in one 1120px column.
   */
  layout?: 'bleed' | 'column';
  children: ReactNode;
  className?: string;
}

/** The frame of the public pages. It renders the <main> element. */
export function PublicShell({ headerRight, footer = true, footerLinks, layout = 'column', children, className }: PublicShellProps) {
  return (
    <div className={cx(styles.public, className)}>
      <TopBar right={headerRight} wide />
      <main className={cx(styles.publicMain, layout === 'column' && styles.column)}>{children}</main>
      {footer && <Footer links={footerLinks} wide />}
    </div>
  );
}

/** A centred column inside a bleed layout: 1120px, or 560px with `narrow`. */
export function Column({ narrow = false, children, className }: { narrow?: boolean; children: ReactNode; className?: string }) {
  return <div className={cx(styles.column, narrow && styles.columnNarrow, className)}>{children}</div>;
}
