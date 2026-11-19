/**
 * npm run db:migrate
 *
 * Applies the files in supabase/migrations, in name order, to the database in DATABASE_URL, or
 * to the local embedded database when DATABASE_URL is not set. Each file runs in its own
 * transaction and is recorded in the _migrations table, so running the command again applies
 * only what is new. Prints what it applied.
 *
 *   npm run db:migrate
 *   DATABASE_URL="postgres://..." npm run db:migrate
 */
import { readMigrationFiles } from '../src/server/db/files';
import { readEnv } from '../src/server/env';
import { parseArgs, rejectUnknown } from './lib/args';
import { openScriptDb, runCommand } from './lib/db';

await runCommand(async () => {
  rejectUnknown(parseArgs(process.argv.slice(2)), []);
  const env = readEnv();
  const files = readMigrationFiles();
  const opened = await openScriptDb(env, { applyMigrations: true });
  try {
    console.log(`Database: ${opened.label}`);
    if (opened.applied.length === 0) {
      console.log(`Nothing to apply. All ${files.length} migrations are in place.`);
    } else {
      console.log(`Applied ${opened.applied.length} of ${files.length} migrations:`);
      for (const name of opened.applied) console.log(`  ${name}`);
    }
  } finally {
    await opened.close();
  }
});
