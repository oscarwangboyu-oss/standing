import type { Db } from '../db';
import type { Env } from '../env';
import { readMigrationFiles } from './files';
import { migrate } from './migrate';

const KEY = Symbol.for('standing.db');
type Holder = { [KEY]?: Promise<Db> };

/**
 * The process-wide database. With DATABASE_URL it is Supabase Postgres. Without it, and never in
 * production, it is the embedded local Postgres, migrated on first use.
 */
export function getDb(env: Env): Promise<Db> {
  const holder = globalThis as Holder;
  // A failed open is not kept: the next request tries again instead of failing until a restart.
  if (!holder[KEY]) {
    holder[KEY] = open(env).catch((error: unknown) => {
      delete holder[KEY];
      throw error;
    });
  }
  return holder[KEY];
}

async function open(env: Env): Promise<Db> {
  if (env.databaseUrl) {
    const { openPostgres } = await import('./postgres');
    return openPostgres(env.databaseUrl);
  }
  if (env.environment === 'production') {
    throw new Error('DATABASE_URL is not set. Production never falls back to the local database.');
  }
  const { mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const dir = resolve(/* turbopackIgnore: true */ process.cwd(), env.dbDir);
  mkdirSync(dir, { recursive: true });
  const { openPglite } = await import('./pglite');
  const { db } = await openPglite(dir);
  await migrate(db, readMigrationFiles(), () => new Date().toISOString());
  return db;
}
