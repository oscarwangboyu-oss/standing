import { describe, expect, it } from 'vitest';
import { first } from '@/server/db';
import { freshDb } from './helpers/db';

describe('local database', () => {
  it('runs Postgres SQL with parameters and transactions', async () => {
    const db = await freshDb();
    await db.exec('create table t (id int primary key, body jsonb not null)');
    await db.transaction(async (tx) => {
      await tx.query('insert into t (id, body) values ($1, $2)', [1, JSON.stringify({ a: 1 })]);
      await tx.query('insert into t (id, body) values ($1, $2)', [2, JSON.stringify({ a: 2 })]);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.query('insert into t (id, body) values ($1, $2)', [3, '{}']);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const row = await first<{ n: number; total: number }>(
      db,
      "select count(*)::int as n, sum((body->>'a')::int)::float8 as total from t",
    );
    expect(row).toEqual({ n: 2, total: 3 });
  });

  it('gives every test its own database', async () => {
    const db = await freshDb();
    const rows = await db.query("select to_regclass('public.t') as t");
    expect(rows[0]).toEqual({ t: null });
  });
});
