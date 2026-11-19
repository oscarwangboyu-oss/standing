import type { Db } from '../db';

export interface MigrationFile {
  /** File name, for example 0001_init.sql. Files apply in name order. */
  name: string;
  sql: string;
}

/** Apply the migrations that have not been applied yet. Returns the names it applied. */
export async function migrate(db: Db, files: readonly MigrationFile[], now: () => string): Promise<string[]> {
  await db.exec(
    'create table if not exists _migrations (name text primary key, applied_at text not null)',
  );
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(file.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(file.sql);
      await tx.query('insert into _migrations (name, applied_at) values ($1, $2)', [file.name, now()]);
    });
    applied.push(file.name);
  }
  return applied;
}
