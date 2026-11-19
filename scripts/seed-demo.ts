/**
 * npm run seed:demo -- [--seed N] [--people N] [--days N] [--reset] [--force-local-url]
 *
 * Fills the local database with simulated people so the team dashboard and the chart can be
 * looked at with data in them: checks, retests, result page events, visits, and for part of
 * the people daily entries, payday bands, weekly wins and people nudges with gaps. Local only: it refuses to run when the environment is
 * production, and when DATABASE_URL is set unless --force-local-url is given and the URL points
 * at this machine.
 *
 * Every person it makes is flagged users.is_demo, and every team response reports how many
 * such people it includes, so simulated numbers cannot be read as real ones.
 *
 *   --seed N           Seed of the random numbers. The same seed gives the same people. Default 1.
 *   --people N         How many people. Default 330: every role meets every age band five times.
 *   --days N           Days of activity before today. Default 45.
 *   --reset            Delete every simulated person first.
 *   --force-local-url  Allow a DATABASE_URL that points at localhost.
 *
 * Stop `npm run dev` before running this against the local database.
 */
import { CURRENT, getBank } from '../src/engine';
import { readEnv } from '../src/server/env';
import { parseArgs, rejectUnknown } from './lib/args';
import { openScriptDb, runCommand } from './lib/db';
import { SEED_DEFAULTS, assertSeedAllowed, formatSeedSummary, removeDemo, seedDemo } from './lib/seed';

await runCommand(async () => {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, ['seed', 'people', 'days', 'reset', 'force-local-url']);
  const env = readEnv();
  // Checked before the database is opened.
  assertSeedAllowed(env, { forceLocalUrl: args.has('force-local-url') });

  const number = (name: 'seed' | 'people' | 'days'): number => {
    const raw = args.value(name);
    if (raw === undefined) return SEED_DEFAULTS[name];
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error(`--${name} must be a whole number`);
    return value;
  };

  const opened = await openScriptDb(env, { applyMigrations: true });
  try {
    console.log(`Database: ${opened.label}`);
    if (args.has('reset')) console.log(`Removed ${await removeDemo(opened.db)} simulated people.`);
    const summary = await seedDemo(opened.db, {
      seed: number('seed'),
      people: number('people'),
      days: number('days'),
      now: new Date(),
    });
    console.log(formatSeedSummary(summary, getBank(CURRENT.bank).ages.map((age) => age.en)));
  } finally {
    await opened.close();
  }
});
