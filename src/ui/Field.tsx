import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Field.module.css';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'prefix' | 'className'> {
  label: ReactNode;
  /**
   * text: free text such as a ticker or a recovery code.
   * number: an amount. It renders a text input with a decimal keypad, because a native number
   * input changes its value on scroll and accepts "e".
   */
  kind?: 'text' | 'number';
  /** Set before the value, such as "$". */
  prefix?: ReactNode;
  /** Set after the value, such as "a month". */
  suffix?: ReactNode;
  /** Help under the field. */
  hint?: ReactNode;
  /** What is wrong and what to do. Shown under the field; the field gets a 2px outline. */
  error?: ReactNode;
  className?: string;
}

/** One labelled input. */
export function Field({ label, kind = 'text', prefix, suffix, hint, error, id, className, ...input }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint !== undefined ? `${inputId}-hint` : undefined;
  const errorId = error !== undefined && error !== null && error !== false ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={cx(styles.box, errorId && styles.invalid)}>
        {prefix !== undefined && (
          <span className={cx(styles.affix, styles.prefix)} aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          className={cx(styles.input, kind === 'number' && styles.number)}
          type="text"
          inputMode={kind === 'number' ? 'decimal' : undefined}
          autoComplete="off"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        {suffix !== undefined && (
          <span className={cx(styles.affix, styles.suffix)} aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {errorId && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hintId && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
