/**
 * The database a script works on: Supabase Postgres when DATABASE_URL is set, otherwise the
 * embedded local database in STANDING_DB_DIR (default .data/local), the same one `npm run dev`
 * uses. Stop the dev server before a script writes to the local database: the embedded
 * Postgres is meant for one process at a time.
 *
 * Scripts read the environment of the shell only. They do not load .env files, so a script
 * never reaches a hosted database unless DATABASE_URL was put in front of the command.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from '../../src/server/db';
import { readMigrationFiles } from '../../src/server/db/files';
import { migrate } from '../../src/server/db/migrate';
import type { Env } from '../../src/server/env';

export interface ScriptDb {
  db: Db;
  /** Where the data lives, for printing. Never contains a password. */
  label: string;
  local: boolean;
  /** Migrations applied while opening. */
  applied: string[];
  close(): Promise<void>;
}

/** Host and database name of a connection string. The user name and password are left out. */
export function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `Postgres at ${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return 'Postgres (connection string could not be parsed)';
  }
}

/** True when a connection string points at this machine. Shared with the server adapter. */
export { isLocalUrl } from '../../src/server/db/url';

/**
 * Opens the database. With `applyMigrations` the pending migrations are applied first; the
 * local database always gets them, as it does when the app opens it.
 */
export async function openScriptDb(env: Env, options: { applyMigrations?: boolean } = {}): Promise<ScriptDb> {
  const now = () => new Date().toISOString();
  if (env.databaseUrl) {
    const { openPostgres } = await import('../../src/server/db/postgres');
    const db = openPostgres(env.databaseUrl);
    const applied = options.applyMigrations ? await migrate(db, readMigrationFiles(), now) : [];
    // The driver keeps its connections open; the command ends the process when it is done.
    return { db, label: describeUrl(env.databaseUrl), local: false, applied, close: async () => undefined };
  }
  if (env.environment === 'production') {
    throw new Error('DATABASE_URL is not set. Production never falls back to the local database.');
  }
  const dir = resolve(process.cwd(), env.dbDir);
  mkdirSync(dir, { recursive: true });
  const { openPglite } = await import('../../src/server/db/pglite');
  const { db, raw } = await openPglite(dir);
  const applied = await migrate(db, readMigrationFiles(), now);
  return { db, label: `local database in ${env.dbDir}`, local: true, applied, close: () => raw.close() };
}

/**
 * Ends the process once everything printed so far has left. A plain process.exit can cut the
 * output short when it goes into a pipe or a file.
 */
function exitWhenFlushed(code: number): void {
  process.exitCode = code;
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
}

/**
 * Runs a command: prints an error as one line and sets the exit code. The process is ended
 * explicitly because the Postgres driver would otherwise keep it alive.
 */
export async function runCommand(main: () => Promise<void>): Promise<void> {
  try {
    await main();
    exitWhenFlushed(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitWhenFlushed(1);
  }
}
