'use client';

import { useEffect, useId, useRef, type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import { sheet as copy } from '@/copy/common';
import { IconButton } from './Button';
import { IconClose } from './icons';
import { cx } from './cx';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  /** Called on Escape, on a tap on the backdrop, on the close button and on a drag down. Set `open` to false in it. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Interface settings of the drag down, not scoring. */
const DRAG = {
  /** Below this width the sheet comes from the bottom and can be dragged (the breakpoint of Sheet.module.css). */
  panelFrom: 700,
  /** A drag further than this closes the sheet. */
  closePx: 96,
  /** So does a flick faster than this, in px per ms, once it has moved a little. */
  closeSpeed: 0.5,
  flickPx: 16,
  /** A finger that rested this long before it let go made no flick. */
  restMs: 80,
  /** The sheet springs back, or slides out, over these. */
  backMs: 220,
  outMs: 200,
} as const;

interface Drag {
  id: number;
  y0: number;
  dy: number;
  t: number;
  speed: number;
  /** False under reduced motion: the sheet does not follow the finger, it only closes past the threshold. */
  follow: boolean;
}

/**
 * Secondary detail (why a price moved, a sector's breakdown, the share options) in a sheet from the
 * bottom on phones and a centred panel from 700px. One sheet at a time. It is a native modal
 * dialog, so focus is trapped inside while it is open and returns to the control that opened it.
 * On a phone the top of the sheet, with its handle, can be dragged down to close it.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // A sheet that was dragged out opens in its place again.
      dialog.style.transform = '';
      dialog.style.transition = '';
      dialog.showModal();
    }
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

  // ---- drag down to close, on the top of the sheet
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || window.innerWidth >= DRAG.panelFrom) return;
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const follow = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    drag.current = { id: event.pointerId, y0: event.clientY, dy: 0, t: event.timeStamp, speed: 0, follow };
    if (ref.current) ref.current.style.transition = 'none';
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - d.y0);
    const dt = Math.max(1, event.timeStamp - d.t);
    d.speed = (dy - d.dy) / dt;
    d.dy = dy;
    d.t = event.timeStamp;
    if (d.follow && ref.current) ref.current.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    const dialog = ref.current;
    if (!dialog) return;
    const speed = event.timeStamp - d.t > DRAG.restMs ? 0 : d.speed;
    const close = event.type === 'pointerup' && (d.dy > DRAG.closePx || (speed > DRAG.closeSpeed && d.dy > DRAG.flickPx));
    if (close && d.follow) {
      dialog.style.transition = `transform ${DRAG.outMs}ms var(--ease-out)`;
      dialog.style.transform = 'translateY(100%)';
      window.setTimeout(onClose, DRAG.outMs);
      return;
    }
    if (close) {
      onClose();
      return;
    }
    dialog.style.transition = d.follow ? `transform ${DRAG.backMs}ms var(--ease-out)` : '';
    dialog.style.transform = '';
  };

  return (
    <dialog ref={ref} className={cx(styles.sheet, className)} aria-labelledby={titleId} onCancel={onCancel} onClick={onClick} onClose={() => open && onClose()}>
      <div className={styles.grip} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <span className={styles.handle} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton label={copy.close} onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
