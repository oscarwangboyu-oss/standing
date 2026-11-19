import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationFile } from './migrate';

/** Read supabase/migrations/*.sql from disk (Node only: local server, scripts, tests). */
export function readMigrationFiles(
  dir = join(/* turbopackIgnore: true */ process.cwd(), 'supabase', 'migrations'),
): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}
