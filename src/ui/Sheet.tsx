'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { sheet as copy } from '@/copy/common';
import { IconButton } from './Button';
import { IconClose } from './icons';
import { cx } from './cx';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  /** Called on Escape, on a tap on the backdrop and on the close button. Set `open` to false in it. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Secondary detail (why a price moved, a sector's breakdown, the share options) in a sheet from the
 * bottom on phones and a centred panel from 700px. One sheet at a time. It is a native modal
 * dialog, so focus is trapped inside while it is open and returns to the control that opened it.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape: keep the dialog under React's control instead of letting it close itself.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };
  // A click that lands on the dialog element itself is a click on the backdrop.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog ref={ref} className={cx(styles.sheet, className)} aria-labelledby={titleId} onCancel={onCancel} onClick={onClick} onClose={() => open && onClose()}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <IconButton label={copy.close} onClick={onClose}>
          <IconClose />
        </IconButton>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
