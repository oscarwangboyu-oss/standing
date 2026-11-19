'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { optionList } from '@/copy/common';
import { cx } from './cx';
import { IconCheck } from './icons';
import styles from './OptionList.module.css';

export interface Option {
  value: string;
  label: ReactNode;
  /** A short fact under the label. */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface OptionListProps {
  options: readonly Option[];
  /** The chosen value, if any. It takes the sector colour and a check. */
  value?: string | null;
  /** Called on click, tap, Enter or Space. In the check this moves on to the next question. */
  onSelect: (value: string) => void;
  /** Accessible name. Pass the id of the question heading as `labelledBy` when there is one. */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  /** 52px rows for sheets and settings. The check uses the full 60px. */
  compact?: boolean;
  className?: string;
}

/**
 * The answers to one question, as a radio group. One tab stop for the group; the arrow keys,
 * Home and End move between options; Enter or Space chooses. Moving with the arrows does not
 * choose, because a choice submits the answer.
 *
 * Give the list a `key` per question so focus and press state never carry over. Inside an
 * element with `sectorStyle(code)` the chosen option takes that sector's colour.
 */
export function OptionList({ options, value = null, onSelect, label, labelledBy, disabled = false, compact = false, className }: OptionListProps) {
  const root = useRef<HTMLDivElement>(null);
  const enabled = options.map((o, i) => (!o.disabled && !disabled ? i : -1)).filter((i) => i >= 0);
  const checked = options.findIndex((o) => o.value === value);
  const tabStop = checked >= 0 && enabled.includes(checked) ? checked : (enabled[0] ?? -1);

  const focusAt = (index: number) => {
    root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (enabled.length === 0) return;
    const target = event.target as HTMLElement;
    const all = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = all.indexOf(target as HTMLButtonElement);
    if (at < 0) return;
    const pos = enabled.indexOf(at);
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = enabled[(pos + 1) % enabled.length];
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = enabled[(pos - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        next = enabled[0];
        break;
      case 'End':
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== undefined) focusAt(next);
  };

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={labelledBy ? undefined : (label ?? optionList.label)}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      className={cx(styles.list, compact && styles.compact, className)}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={disabled || o.disabled}
          className={styles.option}
          onClick={() => onSelect(o.value)}
        >
          <span className={styles.text}>
            <span>{o.label}</span>
            {o.hint !== undefined && <span className={styles.hint}>{o.hint}</span>}
          </span>
          <span className={styles.mark} aria-hidden="true">
            <IconCheck size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}
