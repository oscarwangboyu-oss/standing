'use client';

/**
 * The frame of every app screen.
 *
 * - AppShell from src/ui, with the bottom navigation where the route has it (shellDefaultsFor).
 *   A screen changes its frame with useShell or <ShellConfig /> from src/client/shell.
 * - The route guards (src/client/nav.ts). While it is not known where the person belongs, and
 *   while they are being sent on, a still placeholder stands in for the screen.
 * - The event queue, other tabs and the daily visit (useRuntime).
 * - The developer panel, in development or with ?debug=1.
 * - A "Simulated data" notice while the device holds a record made by the demo script.
 */
import { Suspense, lazy, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ROUTES, routeKind, shellDefaultsFor } from '@/client/nav';
import { useDevice } from '@/client/api';
import { RouteWatcher, useDebug, useGuard, useRuntime } from '@/client/runtime';
import { NO_SHELL_OPTIONS, ShellContext, createShellStore } from '@/client/shell';
import { simulated } from '@/copy/core';
import { AppShell, Note } from '@/ui';
import { Holding } from './_core/Holding';

const DevPanel = lazy(() => import('./_core/DevPanel'));

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shell] = useState(createShellStore);
  const asked = useSyncExternalStore(shell.subscribe, shell.get, () => NO_SHELL_OPTIONS);
  const gate = useGuard();
  const debug = useDebug();
  useRuntime();

  const defaults = shellDefaultsFor(pathname);
  // Settings, the team dashboard and an invite are open to everyone: they render at once.
  const hold = routeKind(pathname) !== 'free' && !gate.ready;
  const options = hold ? NO_SHELL_OPTIONS : asked;
  const nav = options.nav === undefined ? defaults.nav : options.nav === 'none' ? undefined : options.nav;
  const demo = useDevice().profile?.simulated === true;
  const body = hold ? (
    <Holding />
  ) : (
    <>
      {demo && (
        <Note tone="info" title={simulated.title} className="simulated-note">
          <p>{simulated.text}</p>
        </Note>
      )}
      {children}
    </>
  );

  return (
    <ShellContext value={shell}>
      <RouteWatcher />
      {options.bare ? (
        body
      ) : (
        <AppShell
          nav={nav}
          headerRight={options.headerRight}
          aside={options.aside}
          width={options.width ?? defaults.width}
          fill={options.fill ?? defaults.fill}
          footer={options.footer ?? defaults.footer}
          homeHref={options.homeHref ?? (gate.standing.hasCompleted ? ROUTES.market : ROUTES.landing)}
        >
          {body}
        </AppShell>
      )}
      {debug && (
        <Suspense fallback={null}>
          <DevPanel standing={gate.standing} />
        </Suspense>
      )}
    </ShellContext>
  );
}
