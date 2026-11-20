import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary: the one action of a screen, an ink pill. secondary: an outlined pill. quiet: text only. */
  variant?: 'primary' | 'secondary' | 'quiet';
  /** lg is 56px, md is 48px, sm is 44px with tighter padding. */
  size?: 'lg' | 'md' | 'sm';
  /** Renders a link instead of a button. */
  href?: string;
  /** An icon before the label. */
  icon?: ReactNode;
  /** An icon after the label, such as an arrow. */
  iconEnd?: ReactNode;
  /** Fill the width of the parent. */
  full?: boolean;
  /**
   * For a quiet button that starts a line under text: its label lines up with the text above
   * instead of with its own padding. The tap area keeps its full size.
   */
  inline?: boolean;
  children: ReactNode;
  className?: string;
}

/** A pill. One primary per screen. Every size is at least 44px tall. */
export function Button({ variant = 'primary', size = 'md', href, icon, iconEnd, full = false, inline = false, children, className, type, ...rest }: ButtonProps) {
  const cls = cx(styles.button, styles[variant], styles[size], full && styles.full, inline && styles.inline, className);
  const inner = (
    <>
      {icon}
      <span className={styles.label}>{children}</span>
      {iconEnd}
    </>
  );
  if (href !== undefined && !rest.disabled) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} {...rest}>
      {inner}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'> {
  /** The accessible name. Also the tooltip. */
  label: string;
  /** plain: no background until hover. filled: a round surface with a soft shadow. */
  variant?: 'plain' | 'filled';
  children: ReactNode;
  className?: string;
}

/** A round 44px button that holds one icon. */
export function IconButton({ label, variant = 'plain', children, className, type, ...rest }: IconButtonProps) {
  return (
    <button type={type ?? 'button'} className={cx(styles.icon, styles[`icon_${variant}`], className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
