'use client';

import { useId, useState } from 'react';
import { useful as copy } from '@/copy/common';
import { cx } from './cx';
import styles from './Useful.module.css';

export type UsefulAnswer = 'yes' | 'no';

export interface UsefulProps {
  /** The answer, when the parent keeps it. Without it the control keeps its own state. */
  value?: UsefulAnswer | null;
  /** Called with the new answer. Tapping the chosen answer again clears it (null). */
  onChange?: (answer: UsefulAnswer | null) => void;
  className?: string;
}

/** The small Yes / No control at the end of each section of the result. Two pills; the chosen one fills with ink. */
export function Useful({ value, onChange, className }: UsefulProps) {
  const [own, setOwn] = useState<UsefulAnswer | null>(null);
  const controlled = value !== undefined;
  const answer = controlled ? value : own;
  const labelId = useId();
  const choose = (next: UsefulAnswer) => {
    const result = answer === next ? null : next;
    if (!controlled) setOwn(result);
    onChange?.(result);
  };
  return (
    <div className={cx(styles.useful, className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.question}>
        {copy.question}
      </span>
      <span className={styles.buttons}>
        <button type="button" className={styles.button} aria-pressed={answer === 'yes'} onClick={() => choose('yes')}>
          {copy.yes}
        </button>
        <button type="button" className={styles.button} aria-pressed={answer === 'no'} onClick={() => choose('no')}>
          {copy.no}
        </button>
      </span>
    </div>
  );
}
