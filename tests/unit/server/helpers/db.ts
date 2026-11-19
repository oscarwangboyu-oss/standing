import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/server/db';
import { readMigrationFiles } from '@/server/db/files';
import { migrate } from '@/server/db/migrate';
import { wrapPglite } from '@/server/db/pglite';

let template: Promise<PGlite> | undefined;

async function migratedTemplate(): Promise<PGlite> {
  const raw = new PGlite();
  await raw.waitReady;
  await migrate(wrapPglite(raw), readMigrationFiles(), () => '2026-01-01T00:00:00.000Z');
  return raw;
}

/**
 * A fresh, fully migrated, in-memory Postgres for one test. The schema is built once per test file
 * and cloned, so each call is cheap.
 */
export async function freshDb(): Promise<Db> {
  template ??= migratedTemplate();
  const base = await template;
  const copy = (await base.clone()) as unknown as PGlite;
  return wrapPglite(copy);
}
