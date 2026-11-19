import postgres from 'postgres';
import type { Db } from '../db';

type Sql = ReturnType<typeof postgres>;

function wrap(sql: Sql, inTransaction: boolean): Db {
  return {
    async query<T>(text: string, params?: readonly unknown[]) {
      const rows = await sql.unsafe(text, params ? ([...params] as never[]) : []);
      return rows as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (inTransaction) return fn(wrap(sql, true));
      return sql.begin(async (tx) => fn(wrap(tx as unknown as Sql, true))) as Promise<T>;
    },
  };
}

/**
 * Supabase Postgres through its connection string. On Vercel use the pooled "transaction" string;
 * prepared statements are off because the pooler does not support them.
 */
export function openPostgres(url: string): Db {
  const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
  return wrap(sql, false);
}
