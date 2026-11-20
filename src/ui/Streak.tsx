import { streak as copy } from '@/copy/common';
import { cx } from './cx';
import { IconCheck } from './icons';
import styles from './Streak.module.css';

export interface StreakDay {
  /** Short weekday, such as "Fri". The last day is labelled "Today" by the component. */
  label: string;
  recorded: boolean;
  /** A day before the first check. It is drawn faint and never counts as missed. */
  before?: boolean;
}

export interface StreakProps {
  /** Seven days, oldest first. The last one is today. */
  days: readonly StreakDay[];
  /** Days in a row, shown as a figure next to the week. 0 shows a line that says how to start a run. */
  count?: number;
  /** Today was recorded in this visit: its window fills in once (not under reduced motion). */
  fresh?: boolean;
  className?: string;
}

type DayState = 'on' | 'missed' | 'pending' | 'before';

function stateOf(day: StreakDay, isToday: boolean): DayState {
  if (day.recorded) return 'on';
  if (day.before && !isToday) return 'before';
  return isToday ? 'pending' : 'missed';
}

/** The last seven days of the daily open as seven windows: lit when the day was recorded. */
export function Streak({ days, count, fresh = false, className }: StreakProps) {
  const seven = days.slice(-7);
  return (
    <div className={cx(styles.streak, className)}>
      {count !== undefined &&
        (count > 0 ? (
          <p className={styles.count}>
            <b className={styles.fig}>{count}</b>
            <span>{copy.count(count).replace(/^\d+\s*/, '')}</span>
          </p>
        ) : (
          <p className={styles.none}>{copy.none}</p>
        ))}
      <ol className={styles.week} aria-label={copy.label}>
        {seven.map((d, i) => {
          const isToday = i === seven.length - 1;
          const state = stateOf(d, isToday);
          const words = { on: copy.recorded, missed: copy.missed, pending: copy.pending, before: copy.before }[state];
          return (
            <li key={i} className={cx(styles.day, styles[state], isToday && styles.today, isToday && fresh && state === 'on' && styles.fresh)}>
              <i className={styles.cell} aria-hidden="true">
                {state === 'on' && <IconCheck size={14} />}
              </i>
              <span className={styles.label}>
                {isToday ? copy.today : d.label}
                <span className="vh">, {words}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
