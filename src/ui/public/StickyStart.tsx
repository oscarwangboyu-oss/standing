'use client';

import { useEffect, useState } from 'react';
import { START_HREF, sticky as copy } from '@/copy/landing';
import { Button } from '../Button';
import { cx } from '../cx';
import { IconArrowRight } from '../icons';
import styles from './sticky.module.css';

export interface StickyStartProps {
  /** id of the primary action in the hero. The bar shows once it has scrolled away. */
  watch: string;
  /** id of the last primary action. The bar leaves when that one is on screen. */
  until?: string;
}

/**
 * The primary action, pinned to the bottom of a phone screen once the hero button has scrolled
 * away. Hidden from 700px, where the top bar carries the action.
 */
export function StickyStart({ watch, until }: StickyStartProps) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const first = document.getElementById(watch);
    const last = until ? document.getElementById(until) : null;
    if (!first || typeof IntersectionObserver === 'undefined') return;
    let firstGone = false;
    let lastSeen = false;
    const update = () => setShow(firstGone && !lastSeen);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === first) firstGone = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (e.target === last) lastSeen = e.isIntersecting || e.boundingClientRect.top < 0;
      }
      update();
    });
    io.observe(first);
    if (last) io.observe(last);
    return () => io.disconnect();
  }, [watch, until]);

  return (
    <div className={cx(styles.bar, show && styles.show)} aria-hidden={!show} inert={!show}>
      <span className={styles.fact}>{copy.fact}</span>
      <Button href={START_HREF} size="md" iconEnd={<IconArrowRight size={20} />}>
        {copy.cta}
      </Button>
    </div>
  );
}
