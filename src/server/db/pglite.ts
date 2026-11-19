import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../db';

type Queryable = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

function wrap(q: Queryable, root: PGlite | null): Db {
  return {
    async query<T>(sql: string, params?: readonly unknown[]) {
      const res = await q.query<T>(sql, params ? [...params] : []);
      return res.rows;
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      // Nested calls reuse the open transaction.
      if (!root) return fn(wrap(q, null));
      return root.transaction(async (tx) => fn(wrap(tx as unknown as Queryable, null))) as Promise<T>;
    },
  };
}

/** Embedded Postgres. `dataDir` undefined means in-memory (tests). */
export async function openPglite(dataDir?: string): Promise<{ db: Db; raw: PGlite }> {
  const raw = dataDir ? new PGlite(dataDir) : new PGlite();
  await raw.waitReady;
  return { db: wrap(raw as unknown as Queryable, raw), raw };
}

export function wrapPglite(raw: PGlite): Db {
  return wrap(raw as unknown as Queryable, raw);
}
