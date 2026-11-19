'use client';

import { useEffect, useRef, useState } from 'react';
import { ISSUE_PRICE } from '../format';
import { OPEN_DELAY_MS, OPEN_DURATION_MS, easeOut, openProgress, openValue } from './open';

/**
 * pending: rendered, not started. The server renders this state, and CSS already shows the
 *          starting picture (100.00, no line) to people who allow motion, so nothing flashes
 *          between the first paint and hydration.
 * running: the frame loop is updating the figure and the line.
 * done:    landed on the current price. The change line and the end dot fade in.
 * off:     no open. Reduced motion, a disabled prop, or nothing to replay.
 */
export type OpenPhase = 'pending' | 'running' | 'done' | 'off';

export interface OpenState {
  phase: OpenPhase;
  /** The figure to show while the phase is running. Otherwise the current price. */
  value: number;
  /** How much of the chart line is drawn, 0 to 1. 1 unless the phase is running. */
  drawn: number;
}

export interface UseOpenOptions {
  /** Skip the open and show the current price at once. */
  disabled?: boolean;
  /** Horizontal position of each record, 0 to 1, when the chart is not evenly spaced. */
  xs?: readonly number[];
}

/**
 * Replays a price history once: from the issue price through the records to the current price,
 * 250ms delay, 1600ms, ease-out. One requestAnimationFrame loop drives both the hero figure and
 * the chart line, so the figure always matches the tip of the line. Pass the returned state to
 * QuoteHead and PriceChart as their `open` prop.
 *
 * It does not run under prefers-reduced-motion or when disabled.
 */
export function useOpen(history: readonly number[], options: UseOpenOptions = {}): OpenState {
  const { disabled = false, xs } = options;
  const last = history.length > 0 ? (history[history.length - 1] as number) : ISSUE_PRICE;
  const can = !disabled && history.length > 0;
  const [state, setState] = useState<OpenState>({ phase: can ? 'pending' : 'off', value: last, drawn: 1 });

  // The loop reads the latest inputs without restarting when a parent re-renders.
  const input = useRef({ history, xs });
  input.current = { history, xs };

  useEffect(() => {
    const end = () => {
      const h = input.current.history;
      return h.length > 0 ? (h[h.length - 1] as number) : ISSUE_PRICE;
    };
    if (!can) {
      setState({ phase: 'off', value: end(), drawn: 1 });
      return;
    }
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setState({ phase: 'off', value: end(), drawn: 1 });
      return;
    }
    let frame = 0;
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const k = openProgress(t - t0, OPEN_DELAY_MS, OPEN_DURATION_MS);
      if (k < 1) {
        const drawn = easeOut(k);
        setState({ phase: 'running', value: openValue(input.current.history, drawn, input.current.xs), drawn });
        frame = requestAnimationFrame(step);
      } else {
        setState({ phase: 'done', value: end(), drawn: 1 });
      }
    };
    setState({ phase: 'running', value: openValue(input.current.history, 0, input.current.xs), drawn: 0 });
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // The open runs once per mount, or once when a history first becomes available.
  }, [can]);

  if ((state.phase === 'done' || state.phase === 'off') && state.value !== last) {
    // After the open, follow the current price directly.
    return { ...state, value: last };
  }
  return state;
}
