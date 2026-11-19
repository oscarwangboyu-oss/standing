import { cx } from './cx';
import styles from './Ticker.module.css';

export interface TickerProps {
  children: string;
  /** chip: the person's own ticker, on an ink pill. plain: a ticker in running text or a table. */
  variant?: 'chip' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** A ticker code, such as RIVR or SKIL. Always upper case, in the display face. */
export function Ticker({ children, variant = 'plain', size = 'md', className }: TickerProps) {
  return <span className={cx(styles.ticker, styles[variant], styles[size], className)}>{children.toUpperCase()}</span>;
}
