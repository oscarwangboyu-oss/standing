import { cx } from './cx';
import styles from './Rule.module.css';

export interface RuleProps {
  className?: string;
}

/** A hairline between two groups inside a card. Use space first; use this when space is not enough. */
export function Rule({ className }: RuleProps) {
  return <hr className={cx(styles.rule, className)} />;
}
