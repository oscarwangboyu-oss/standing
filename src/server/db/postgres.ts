import postgres from 'postgres';
import type { Db } from '../db';
import { isLocalUrl } from './url';

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
 * JSON and JSONB, both ways. The server passes JSON as text (`$1::jsonb` with JSON.stringify),
 * which is what PGlite expects. postgres.js would stringify that text a second time and store a
 * JSON string instead of an object, so text goes through as it is. Objects are still encoded.
 * tests/unit/server/driver.test.ts runs the API through this adapter to keep the two in step.
 */
const JSON_TEXT = {
  to: 3802,
  from: [114, 3802],
  serialize: (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value)),
  parse: (text: string) => JSON.parse(text) as unknown,
};

/** The connection settings, apart from the URL. Exported for the driver test. */
export function postgresOptions(url: string) {
  return {
    // The Supabase transaction pooler does not support prepared statements.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    // Encrypted unless the database is on this machine. postgres.js connects in plain text by default.
    ssl: isLocalUrl(url) ? (false as const) : ('require' as const),
    types: { jsonText: JSON_TEXT },
    // Migrations print NOTICEs ("relation already exists, skipping"); nothing in them is needed.
    onnotice: () => undefined,
  };
}

/**
 * Supabase Postgres through its connection string. On Vercel use the pooled "transaction" string;
 * prepared statements are off because the pooler does not support them, and the connection is
 * encrypted (TLS) for every host that is not this machine.
 */
export function openPostgres(url: string, overrides: { max?: number } = {}): Db {
  const sql = postgres(url, { ...postgresOptions(url), ...overrides } as never);
  return wrap(sql, false);
}
