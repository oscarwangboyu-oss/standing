/**
 * The only place that reads process.env. Everything else takes an Env.
 */
export type EnvironmentName = 'local' | 'preview' | 'production';

export interface Env {
  environment: EnvironmentName;
  /** Supabase Postgres connection string. Null means: use the embedded local database. */
  databaseUrl: string | null;
  /** Directory of the embedded local database. */
  dbDir: string;
  /** Passphrase for the team dashboard. Null closes the dashboard. */
  adminPassphrase: string | null;
  /** Stage switches. Default on locally, off in production. */
  flags: { dailyOpen: boolean; payday: boolean; weeklyWin: boolean; peopleNudge: boolean };
  /**
   * PostHog forwarding. Disabled when key is null. `salt` is mixed into the hash that stands
   * in for a user id; when POSTHOG_SALT is not set the project key is used, so ids stay stable
   * as long as the key does.
   */
  posthog: { key: string | null; host: string; salt: string | null };
}

type Vars = Record<string, string | undefined>;

function environmentOf(vars: Vars): EnvironmentName {
  const explicit = vars.STANDING_ENV;
  if (explicit === 'local' || explicit === 'preview' || explicit === 'production') return explicit;
  if (vars.VERCEL_ENV === 'production') return 'production';
  if (vars.VERCEL_ENV === 'preview') return 'preview';
  return vars.NODE_ENV === 'production' && vars.DATABASE_URL ? 'production' : 'local';
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return fallback;
}

export function readEnv(vars: Vars = process.env): Env {
  const environment = environmentOf(vars);
  const defaultOn = environment !== 'production';
  return {
    environment,
    databaseUrl: vars.DATABASE_URL || null,
    dbDir: vars.STANDING_DB_DIR || '.data/local',
    adminPassphrase: vars.ADMIN_PASSPHRASE || null,
    flags: {
      dailyOpen: flag(vars.FLAG_DAILY_OPEN, defaultOn),
      payday: flag(vars.FLAG_PAYDAY, defaultOn),
      weeklyWin: flag(vars.FLAG_WEEKLY_WIN, defaultOn),
      peopleNudge: flag(vars.FLAG_PEOPLE_NUDGE, defaultOn),
    },
    posthog: {
      key: vars.POSTHOG_KEY || null,
      host: vars.POSTHOG_HOST || 'https://us.i.posthog.com',
      salt: vars.POSTHOG_SALT || null,
    },
  };
}
