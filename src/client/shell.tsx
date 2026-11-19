'use client';

/**
 * How a screen changes the frame that app/(app)/layout.tsx puts around it.
 *
 * The layout renders AppShell with the defaults of the route (shellDefaultsFor in ./nav.ts).
 * A screen that needs more (an illustration beside the content, a control in the top bar)
 * says so from inside:
 *
 *   useShell({ aside: <SkylineCard ... />, headerRight: <IconButton ... /> });
 *
 * or, from a server component, <ShellConfig nav="log" />. The options last while the screen
 * is mounted. The screen itself does not render again when the frame does.
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, type ReactNode } from 'react';
import type { NavPlace } from './nav';

export interface ShellOptions {
  /** A place: that item is current. null: the navigation with no item current. "none": no navigation. Leave out for the default of the route. */
  nav?: NavPlace | null | 'none';
  /** One control on the right of the top bar. */
  headerRight?: ReactNode;
  /** The illustration side of the screen (AppShell `aside`). */
  aside?: ReactNode;
  width?: 'col' | 'wide';
  /** The main area fills the screen so content can sit at the bottom. */
  fill?: boolean;
  footer?: boolean;
  /** Where the wordmark links to. */
  homeHref?: string;
  /** No AppShell at all: the screen brings its own frame and its own <main>. */
  bare?: boolean;
}

export interface ShellStore {
  get(): ShellOptions;
  /** Puts the options of one screen in place. `owner` names the screen. */
  set(owner: string, options: ShellOptions): void;
  /** Removes the options, unless another screen has put its own in place since. */
  clear(owner: string): void;
  subscribe(listener: () => void): () => void;
}

export const NO_SHELL_OPTIONS: ShellOptions = Object.freeze({});

const KEYS = ['nav', 'headerRight', 'aside', 'width', 'fill', 'footer', 'homeHref', 'bare'] as const;

function sameOptions(a: ShellOptions, b: ShellOptions): boolean {
  return KEYS.every((key) => a[key] === b[key]);
}

export function createShellStore(): ShellStore {
  let current: ShellOptions = NO_SHELL_OPTIONS;
  let currentOwner: string | null = null;
  const listeners = new Set<() => void>();
  const put = (owner: string | null, options: ShellOptions) => {
    currentOwner = owner;
    if (sameOptions(current, options)) return;
    current = options;
    for (const listener of [...listeners]) listener();
  };
  return {
    get: () => current,
    set: (owner, options) => put(owner, options),
    clear(owner) {
      if (currentOwner === owner) put(null, NO_SHELL_OPTIONS);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Provided by app/(app)/layout.tsx. null outside it: useShell does nothing there. */
export const ShellContext = createContext<ShellStore | null>(null);

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Sets the frame of this screen. Call it on every render with the current options. */
export function useShell(options: ShellOptions): void {
  const store = useContext(ShellContext);
  const owner = useId();
  // No dependency list: an element in the options is new on every render of the screen.
  useBeforePaint(() => {
    store?.set(owner, options);
  });
  useBeforePaint(() => () => store?.clear(owner), [store, owner]);
}

/** The same as useShell, as an element, for a screen that is a server component. */
export function ShellConfig(options: ShellOptions) {
  useShell(options);
  return null;
}
