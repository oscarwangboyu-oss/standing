'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Toast.module.css';

export interface ToastProps {
  /** The message. Nothing is shown while it is null. The live region stays mounted so it is announced. */
  children: ReactNode | null;
  /** Render in the flow instead of fixed above the navigation. Only for previews. */
  embedded?: boolean;
  className?: string;
}

/** One short sentence that something happened, such as "Image saved". Announced politely. */
export function Toast({ children, embedded = false, className }: ToastProps) {
  const shown = children !== null && children !== undefined && children !== false;
  return (
    <div className={cx(styles.region, embedded && styles.embedded, className)} role="status" aria-live="polite">
      {shown && <div className={styles.toast}>{children}</div>}
    </div>
  );
}

/**
 * State for one toast at a time.
 *
 *   const toast = useToast();
 *   toast.show('Link copied');
 *   <Toast>{toast.message}</Toast>
 */
export function useToast(durationMs = 3200) {
  const [message, setMessage] = useState<ReactNode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);
  const show = useCallback(
    (next: ReactNode) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, durationMs);
    },
    [durationMs],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { message, show, hide };
}
