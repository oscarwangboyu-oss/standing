'use client';

/**
 * Report events of the result screen (PROMPT.md 7.1): a section was seen, how long it stayed in
 * view, the share action was used, the "Was this part useful?" click. They go through the event
 * queue, so they survive a lost connection, and they never enter scoring.
 *
 * A block of the screen can hold more than one section of REPORT_SECTIONS (the quote head and
 * the key figures, the chart and the market comment). Such a block reports each of its sections.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { queue } from '@/client/api';
import { newClientId } from '@/client/device';
import { MAX_DWELL_MS, type ReportEventInput, type ReportSection } from '@/shared/api';

/** Shorter stays are not reported: a section that only scrolled past was not read. */
const MIN_DWELL_MS = 1000;

export interface Report {
  /**
   * A ref for the element of a block. The block counts as in view while part of it is in the
   * middle of the screen. `place` tells two elements of the same block apart, when the layout
   * renders it once for a phone and once for a wide screen.
   */
  mark(sections: readonly ReportSection[], place?: string): (element: Element | null) => void;
  /** The share action was used. */
  share(section?: ReportSection): void;
  /** The answer to "Was this part useful?" for a block. A cleared answer sends nothing. */
  useful(sections: readonly ReportSection[], answer: 'yes' | 'no' | null): void;
}

interface Block {
  sections: readonly ReportSection[];
  element: Element | null;
  inView: boolean;
  /** When the block came into view, on the page's clock. null while it is out of view or the page is hidden. */
  since: number | null;
  ref: (element: Element | null) => void;
}

/** `sessionId` is the check whose result is on screen. Nothing is sent while it is null. */
export function useReport(sessionId: string | null): Report {
  const session = useRef(sessionId);
  const blocks = useRef(new Map<string, Block>());
  const seen = useRef(new Set<ReportSection>());
  const observer = useRef<IntersectionObserver | null>(null);

  const send = useCallback((event: Omit<ReportEventInput, 'id'>) => {
    if (!session.current) return;
    queue().report(session.current, { id: newClientId(), ...event });
  }, []);

  const enter = useCallback(
    (block: Block) => {
      block.inView = true;
      if (document.visibilityState === 'visible' && block.since === null) block.since = performance.now();
      for (const section of block.sections) {
        if (seen.current.has(section)) continue;
        seen.current.add(section);
        send({ section, kind: 'seen' });
      }
    },
    [send],
  );

  /** Closes the running stay of a block and reports it. */
  const settle = useCallback(
    (block: Block) => {
      if (block.since === null) return;
      const ms = Math.round(performance.now() - block.since);
      block.since = null;
      if (ms < MIN_DWELL_MS) return;
      for (const section of block.sections) send({ section, kind: 'dwell', ms: Math.min(ms, MAX_DWELL_MS) });
    },
    [send],
  );

  useEffect(() => {
    if (session.current !== sessionId) {
      // Another check on screen: its sections have not been seen yet.
      for (const block of blocks.current.values()) settle(block);
      seen.current = new Set();
      session.current = sessionId;
    }
    if (!sessionId || typeof IntersectionObserver === 'undefined') return;
    const all = blocks.current;
    // In view: any part of the block inside the middle three fifths of the screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const block = [...all.values()].find((b) => b.element === entry.target);
          if (!block) continue;
          if (entry.isIntersecting) enter(block);
          else {
            block.inView = false;
            settle(block);
          }
        }
      },
      { rootMargin: '-20% 0px -20% 0px', threshold: 0 },
    );
    observer.current = io;
    for (const block of all.values()) if (block.element) io.observe(block.element);

    const onVisibility = () => {
      for (const block of all.values()) {
        if (document.visibilityState === 'hidden') settle(block);
        else if (block.inView && block.since === null) block.since = performance.now();
      }
    };
    const onHide = () => {
      for (const block of all.values()) settle(block);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      io.disconnect();
      observer.current = null;
      for (const block of all.values()) {
        settle(block);
        block.inView = false;
      }
    };
  }, [sessionId, enter, settle]);

  return useMemo<Report>(
    () => ({
      mark(sections, place = '') {
        const key = `${sections.join('+')}#${place}`;
        let block = blocks.current.get(key);
        if (!block) {
          const made: Block = {
            sections,
            element: null,
            inView: false,
            since: null,
            ref(element) {
              if (made.element && made.element !== element) {
                observer.current?.unobserve(made.element);
                settle(made);
                made.inView = false;
              }
              made.element = element;
              if (element) observer.current?.observe(element);
            },
          };
          block = made;
          blocks.current.set(key, block);
        }
        return block.ref;
      },
      share(section = 'share') {
        send({ section, kind: 'share' });
      },
      useful(sections, answer) {
        if (answer === null) return;
        for (const section of sections) send({ section, kind: 'useful', useful: answer === 'yes' });
      },
    }),
    [send, settle],
  );
}
