import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import { IconChevron } from '../icons';
import styles from './check.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** The first entry is usually the empty choice, with value "". */
  options: readonly SelectOption[];
  disabled?: boolean;
  className?: string;
}

/**
 * One labelled choice from a long list, as a native select in the look of Field. Field holds
 * an input only, so the optional state of /start uses this wrapper. The native control keeps
 * the phone's own picker and type-ahead on a keyboard.
 */
export function SelectField({ label, value, onChange, options, disabled = false, className }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cx(styles.select, className)}>
      <label className={styles.selectLabel} htmlFor={id}>
        {label}
      </label>
      <div className={styles.selectBox}>
        <select id={id} className={styles.selectInput} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.selectMark} aria-hidden="true">
          <IconChevron size={20} />
        </span>
      </div>
    </div>
  );
}
