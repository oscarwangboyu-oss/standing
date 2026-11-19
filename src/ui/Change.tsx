import { quote } from '@/copy/common';
import { cx } from './cx';
import { direction, formatChange, formatPercent } from './format';
import { IconDown, IconMinus, IconUp } from './icons';
import styles from './Change.module.css';

export interface ChangeProps {
  /** The change in points. */
  value: number;
  /** The change in percent, shown in brackets after the points. */
  pct?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * A gain or a loss. Always a pill with an arrow, a sign and a word for screen readers, so it is
 * never read by colour alone and never confused with a sector colour.
 */
export function Change({ value, pct, size = 'md', className }: ChangeProps) {
  const dir = direction(value);
  const word = dir === 'up' ? quote.up : dir === 'down' ? quote.down : quote.unchanged;
  const iconSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;
  return (
    <span className={cx(styles.change, styles[dir], styles[size], className)}>
      {dir === 'up' ? <IconUp size={iconSize} /> : dir === 'down' ? <IconDown size={iconSize} /> : <IconMinus size={iconSize} />}
      <span className="vh">{word} </span>
      <span>{formatChange(value)}</span>
      {pct !== undefined && pct !== null && <span className={styles.pct}>({formatPercent(pct)})</span>}
    </span>
  );
}
