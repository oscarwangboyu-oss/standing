import type { ReactNode } from 'react';
import Link from 'next/link';
import { brand } from '@/copy/common';
import { BottomNav, type NavId, type NavItem } from './BottomNav';
import { cx } from './cx';
import { Footer } from './Footer';
import { Mark } from './icons';
import styles from './Shell.module.css';

/** The wordmark: the five-tower mark and the name. It links to the front door. */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={styles.wordmark}>
      <Mark size={26} />
      <span>{brand.name}</span>
    </Link>
  );
}

/** The bar at the top of every screen: the wordmark, the navigation on a wide screen, one thing on the right. */
export function TopBar({ right, homeHref, nav, navItems, wide = false, mid = false }: { right?: ReactNode; homeHref?: string; nav?: NavId | string | null; navItems?: readonly NavItem[]; wide?: boolean; mid?: boolean }) {
  return (
    <header className={cx(styles.top, wide && styles.topWide, mid && styles.topMid)}>
      <Wordmark href={homeHref} />
      {nav !== undefined && <BottomNav placement="top" current={nav} items={navItems} />}
      {right !== undefined && <div className={styles.topRight}>{right}</div>}
    </header>
  );
}

export interface AppShellProps {
  children: ReactNode;
  /** Show the navigation with this item current. Leave out on the check and the result. */
  nav?: NavId | string | null;
  navItems?: readonly NavItem[];
  /** One control on the right of the top bar. */
  headerRight?: ReactNode;
  /**
   * The illustration side of the screen, usually a skyline. On a phone it comes first, above the
   * content. From 960px it is a sticky column on the left and the content scrolls on the right.
   */
  aside?: ReactNode;
  /** wide: the content may use up to 960px from 960px up, for a screen that sets two things side by side (compare). */
  width?: 'col' | 'wide';
  /** The main area fills the rest of the screen, so content can be anchored to the bottom (the question screen). */
  fill?: boolean;
  /** Show the footer with the company line and the required statements. */
  footer?: boolean;
  /** Where the wordmark links to. */
  homeHref?: string;
  /** Do not stretch to the height of the viewport. Only for previews. */
  embedded?: boolean;
  className?: string;
}

/**
 * The frame of every app screen. On a phone: one column capped at 560px. From 960px, when the
 * screen has an aside: two columns, the illustration left and the 560px column right. It renders
 * the <main> element.
 */
export function AppShell({ children, nav, navItems, headerRight, aside, width = 'col', fill = false, footer = false, homeHref, embedded = false, className }: AppShellProps) {
  const hasNav = nav !== undefined;
  const split = aside !== undefined;
  return (
    <div className={cx(styles.app, embedded && styles.embedded, split && styles.split, width === 'wide' && styles.wide, className)}>
      <TopBar right={headerRight} homeHref={homeHref} nav={nav} navItems={navItems} wide={split} mid={width === 'wide'} />
      <div className={styles.frame}>
        {split && <div className={styles.aside}>{aside}</div>}
        <main className={cx(styles.main, fill && styles.fill)}>{children}</main>
      </div>
      {footer && <Footer className={styles.appFoot} />}
      {hasNav && <BottomNav current={nav} items={navItems} />}
    </div>
  );
}

export interface BlockProps {
  /** The block title. Leave out for a block that needs no heading, and give `label` instead. */
  title?: ReactNode;
  /** One thing on the right of the title, such as a quiet link. */
  action?: ReactNode;
  label?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}

/** A section of an app screen, with a 24px title. Blocks are 40px apart. */
export function Block({ title, action, label, id, children, className }: BlockProps) {
  return (
    <section className={cx(styles.block, className)} aria-labelledby={title !== undefined && id ? id : undefined} aria-label={title === undefined ? label : undefined}>
      {title !== undefined && (
        <div className={styles.blockHead}>
          <h2 id={id} className={styles.blockTitle}>
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
