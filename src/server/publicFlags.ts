import { readEnv } from './env';

export interface PublicFlags {
  dailyOpen: boolean;
  payday: boolean;
  weeklyWin: boolean;
  peopleNudge: boolean;
}

/**
 * The four stage-2 switches, for a page rendered on the server (the landing page lists only the
 * tools that are on). The landing page is static, so the switches are read when it is built:
 * turning one on in production takes a redeploy, as any change of an environment variable on
 * Vercel does.
 */
export function publicFlags(): PublicFlags {
  const { flags } = readEnv();
  return { dailyOpen: flags.dailyOpen, payday: flags.payday, weeklyWin: flags.weeklyWin, peopleNudge: flags.peopleNudge };
}
