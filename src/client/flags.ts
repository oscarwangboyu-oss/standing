'use client';

/**
 * Feature switches from GET /api/config. Each micro app is on locally and off in production
 * until the team turns it on. Until the config has answered, everything reads as off: a
 * screen never shows an entry it would have to take away again.
 */
import type { ConfigResponse, EnvironmentName, FeatureFlags, MicroApp } from '../shared/api';
import { CURRENT } from '../engine/registry';
import { useConfig } from './api';

export const FLAGS_OFF: FeatureFlags = Object.freeze({ dailyOpen: false, payday: false, weeklyWin: false, peopleNudge: false });

/** The switch of each micro app, by its `source` name. */
export const FLAG_OF_APP = {
  daily_open: 'dailyOpen',
  payday: 'payday',
  weekly_win: 'weeklyWin',
  people_nudge: 'peopleNudge',
} as const satisfies Record<MicroApp, keyof FeatureFlags>;

export function flagsOf(config: ConfigResponse | null | undefined): FeatureFlags {
  return config ? { ...FLAGS_OFF, ...config.flags } : FLAGS_OFF;
}

export function isOn(config: ConfigResponse | null | undefined, app: MicroApp): boolean {
  return flagsOf(config)[FLAG_OF_APP[app]];
}

/**
 * True when the server computes with another question bank than the one bundled in this page.
 * A check cannot start then (the server answers bank_version_mismatch): reload the page.
 */
export function bankIsStale(config: ConfigResponse | null | undefined): boolean {
  return !!config && config.versions.bank !== CURRENT.bank;
}

export interface FlagsView {
  flags: FeatureFlags;
  /** False until /api/config has answered. `flags` are all off until then. */
  loaded: boolean;
  environment: EnvironmentName | null;
  /** The bundled question bank is not the server's: ask for a reload before a check starts. */
  bankStale: boolean;
  /** False when no team passphrase is configured and the dashboard is closed. */
  teamOpen: boolean;
  error: Error | null;
}

export function useFlags(): FlagsView {
  const config = useConfig();
  return {
    flags: flagsOf(config.data),
    loaded: config.data !== null,
    environment: config.data?.environment ?? null,
    bankStale: bankIsStale(config.data),
    teamOpen: config.data?.teamOpen ?? false,
    error: config.error,
  };
}
