import Link from 'next/link';
import { brand, footer as copy, statements } from '@/copy/common';
import { cx } from './cx';
import { Mark } from './icons';
import styles from './Shell.module.css';

export interface FooterProps {
  /** Print the two required statements above the company line. On by default. */
  showStatements?: boolean;
  /** Links such as the privacy notice and the terms. */
  links?: ReadonlyArray<{ href: string; label: string }>;
  /** Cap at the wide column instead of the app column. */
  wide?: boolean;
  className?: string;
}

/**
 * Bayu Technology, Atlanta, Georgia, the contact address, and the statements the product must
 * make: not a medical diagnosis, not financial advice, not a credit score, not a security.
 */
export function Footer({ showStatements = true, links, wide = false, className }: FooterProps) {
  return (
    <footer className={cx(styles.foot, wide && styles.footWide, className)} aria-label={copy.label}>
      <div className={styles.footInner}>
        {showStatements && (
          <div className={styles.statements} role="group" aria-label={copy.statementsLabel}>
            <p>{statements.notAdvice}</p>
            <p>{statements.notSecurity}</p>
          </div>
        )}
        <div className={styles.footLine}>
          <span className={styles.footBrand}>
            <Mark size={20} />
            {brand.company}, {brand.place}
          </span>
          <span className={styles.footLinks}>
            <a href={`mailto:${brand.email}`}>{brand.email}</a>
            {links?.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
