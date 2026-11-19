import Link from 'next/link';
import type { ReactNode } from 'react';
import { nav as copy } from '@/copy/common';
import { cx } from './cx';
import { IconLog, IconMarket, IconOpen, IconSettings } from './icons';
import styles from './BottomNav.module.css';

export type NavId = 'market' | 'open' | 'log' | 'settings';

export interface NavItem {
  id: NavId | string;
  label: string;
  href: string;
  icon: ReactNode;
}

/** The four places of the app after the first check. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'market', label: copy.market, href: '/market', icon: <IconMarket /> },
  { id: 'open', label: copy.open, href: '/open', icon: <IconOpen /> },
  { id: 'log', label: copy.log, href: '/log', icon: <IconLog /> },
  { id: 'settings', label: copy.settings, href: '/settings', icon: <IconSettings /> },
];

export interface BottomNavProps {
  /** The id of the item for the page on screen. */
  current?: NavId | string | null;
  items?: readonly NavItem[];
  /** bar: the floating dock at the bottom of a phone screen. top: the links in the top bar on a wide screen. */
  placement?: 'bar' | 'top';
  className?: string;
}

/** Icons with labels, within thumb reach. The current place sits on an ink pill. */
export function BottomNav({ current = null, items = NAV_ITEMS, placement = 'bar', className }: BottomNavProps) {
  return (
    <nav className={cx(styles.nav, styles[placement], className)} aria-label={copy.label}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className={styles.link} aria-current={item.id === current ? 'page' : undefined}>
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
