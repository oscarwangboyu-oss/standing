import { streak as copy } from '@/copy/common';
import { cx } from './cx';
import { IconCheck } from './icons';
import styles from './Streak.module.css';

export interface StreakDay {
  /** Short weekday, such as "Fri". The last day is labelled "Today" by the component. */
  label: string;
  recorded: boolean;
}

export interface StreakProps {
  /** Seven days, oldest first. The last one is today. */
  days: readonly StreakDay[];
  /** Days in a row, shown as a figure next to the week. */
  count?: number;
  className?: string;
}

/** The last seven days of the daily open as seven windows: lit when the day was recorded. */
export function Streak({ days, count, className }: StreakProps) {
  const seven = days.slice(-7);
  return (
    <div className={cx(styles.streak, className)}>
      {count !== undefined && (
        <p className={styles.count}>
          <b className={styles.fig}>{count}</b>
          <span>{copy.count(count).replace(/^\d+\s*/, '')}</span>
        </p>
      )}
      <ol className={styles.week} aria-label={copy.label}>
        {seven.map((d, i) => {
          const isToday = i === seven.length - 1;
          const state = d.recorded ? copy.recorded : isToday ? copy.pending : copy.missed;
          return (
            <li key={i} className={cx(styles.day, d.recorded ? styles.on : isToday ? styles.pending : styles.missed, isToday && styles.today)}>
              <i className={styles.cell} aria-hidden="true">
                {d.recorded && <IconCheck size={14} />}
              </i>
              <span className={styles.label}>
                {isToday ? copy.today : d.label}
                <span className="vh">, {state}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
