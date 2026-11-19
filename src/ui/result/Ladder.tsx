import { position as copy } from '@/copy/result';
import { cx } from '../cx';
import styles from './result.module.css';

export interface LadderProps {
  /** Rungs of the ladder, from the algorithm parameters. */
  rungs: number;
  /** The rung the prices correspond to, 1 to `rungs`. */
  objective: number;
  /** The two rungs the person chose for themselves. */
  own: readonly [number, number];
  className?: string;
}

/**
 * The ladder of the position section, lying on its side: rung 1 on the left. The rung from the
 * prices is filled, the person's own placement is outlined, so the two are told apart without
 * colour.
 */
export function Ladder({ rungs, objective, own, className }: LadderProps) {
  const low = Math.min(own[0], own[1]);
  const high = Math.max(own[0], own[1]);
  return (
    <div className={cx(styles.ladder, className)}>
      <ol className={styles.rungs} style={{ gridTemplateColumns: `repeat(${rungs}, minmax(0, 1fr))` }} role="img" aria-label={copy.ladderLabel(objective, low, high, rungs)}>
        {Array.from({ length: rungs }, (_, i) => {
          const rung = i + 1;
          return (
            <li key={rung} className={cx(styles.rung, rung === objective && styles.rungObjective, rung >= low && rung <= high && styles.rungOwn)} aria-hidden="true">
              {rung}
            </li>
          );
        })}
      </ol>
      <p className={styles.ladderLegend} aria-hidden="true">
        <span>
          <i className={cx(styles.swatch, styles.swatchObjective)} />
          {copy.legendObjective}
        </span>
        <span>
          <i className={cx(styles.swatch, styles.swatchOwn)} />
          {copy.legendSubjective}
        </span>
      </p>
    </div>
  );
}
