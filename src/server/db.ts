/**
 * The only database surface that server code may depend on.
 *
 * Production runs on Supabase Postgres (adapter: ./db/postgres.ts). Local development and tests run on
 * PGlite, an embedded Postgres (adapter: ./db/pglite.ts). Both speak the same SQL, so handlers are
 * written once, in PostgreSQL with $1-style placeholders.
 *
 * Conventions that keep the two adapters returning identical rows:
 * - Timestamps are stored as text in ISO 8601 UTC, written by the application (the clock is injected).
 * - Days are stored as text, YYYY-MM-DD.
 * - Cast every aggregate: count(*)::int, avg(x)::float8, sum(x)::float8. Never return int8 or numeric.
 * - JSON is stored as jsonb and comes back parsed.
 */
export type Row = Record<string, unknown>;

export interface Db {
  /** Run one statement. Returns the rows (empty for statements that return none). */
  query<T = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Run several statements without parameters (migrations, test fixtures). */
  exec(sql: string): Promise<void>;
  /** Run the callback inside one transaction. Throwing rolls it back. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** First row or null. */
export async function first<T = Row>(db: Db, sql: string, params?: readonly unknown[]): Promise<T | null> {
  const rows = await db.query<T>(sql, params);
  return rows[0] ?? null;
}
