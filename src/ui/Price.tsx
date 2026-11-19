import { cx } from './cx';
import { formatPrice } from './format';
import styles from './Price.module.css';

export interface PriceProps {
  value: number;
  /** hero: the overall price at the top of a screen. xl, lg, md, sm: everywhere else. */
  size?: 'hero' | 'xl' | 'lg' | 'md' | 'sm';
  className?: string;
}

/**
 * A price, always to two decimals, in the display face with tabular figures. The decimals are
 * set smaller so the whole number reads first; it is one number to a screen reader.
 */
export function Price({ value, size = 'md', className }: PriceProps) {
  const text = formatPrice(value);
  const dot = text.indexOf('.');
  return (
    <span className={cx(styles.price, styles[size], className)}>
      <span aria-hidden="true">
        {text.slice(0, dot)}
        <span className={styles.dec}>{text.slice(dot)}</span>
      </span>
      <span className="vh">{text}</span>
    </span>
  );
}
