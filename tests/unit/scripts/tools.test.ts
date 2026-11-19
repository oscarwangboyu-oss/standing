// The small pieces the commands in scripts/ are made of: flags, the database label, the trial
// algorithm of the recompute command, and applying migrations.

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, ALGOS, CURRENT, getAlgo } from '@/engine';
import { readMigrationFiles } from '@/server/db/files';
import { migrate } from '@/server/db/migrate';
import { wrapPglite } from '@/server/db/pglite';
import { parseArgs, rejectUnknown } from '../../../scripts/lib/args';
import { describeUrl, isLocalUrl } from '../../../scripts/lib/db';
import { registerTrialAlgo, setAtPath } from '../../../scripts/lib/variant';

describe('flags', () => {
  it('reads values, switches and repeated flags', () => {
    const args = parseArgs(['--algo', '2', '--write', '--set', 'a.b=1', '--set=c=2', '--norm=campus-1', 'stray']);
    expect(args.value('algo')).toBe('2');
    expect(args.has('write')).toBe(true);
    expect(args.value('write')).toBeUndefined();
    expect(args.values('set')).toEqual(['a.b=1', 'c=2']);
    expect(args.value('norm')).toBe('campus-1');
    expect(args.has('json')).toBe(false);
    expect(args.values('json')).toEqual([]);
  });

  it('a typo stops the command', () => {
    const args = parseArgs(['--wirte', '--algo', '2']);
    expect(args.unknown(['algo', 'write'])).toEqual(['wirte']);
    expect(() => rejectUnknown(args, ['algo', 'write'])).toThrow(/unknown option --wirte/);
    expect(() => rejectUnknown(parseArgs(['--algo', '2']), ['algo', 'write'])).not.toThrow();
  });
});

describe('the database label', () => {
  it('names host and database and never the user or the password', () => {
    const label = describeUrl('postgres://postgres.abcd:s3cret-pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres');
    expect(label).toBe('Postgres at aws-0-us-east-1.pooler.supabase.com:6543/postgres');
    expect(label).not.toContain('s3cret');
    expect(label).not.toContain('abcd');
    expect(describeUrl('not a url')).toBe('Postgres (connection string could not be parsed)');
  });

  it('knows which URLs are on this machine', () => {
    for (const url of ['postgres://u:p@localhost:5432/x', 'postgres://u:p@127.0.0.1/x', 'postgres://u:p@[::1]:5432/x', 'postgres://db.localhost/x']) {
      expect(isLocalUrl(url), url).toBe(true);
    }
    for (const url of ['postgres://u:p@db.example.com/x', 'postgres://u:p@localhost.example.com/x', 'postgres://u:p@10.0.0.5/x', 'nonsense']) {
      expect(isLocalUrl(url), url).toBe(false);
    }
  });
});

describe('a trial algorithm', () => {
  it('setAtPath replaces a number or a switch and refuses anything else', () => {
    const params = { timing: { multiplierFloor: 0.5, on: true, scan: { en: 1400 } }, name: 'x' };
    setAtPath(params, 'timing.multiplierFloor', '0.8');
    setAtPath(params, 'timing.scan.en', '1000');
    setAtPath(params, 'timing.on', 'false');
    expect(params).toEqual({ timing: { multiplierFloor: 0.8, on: false, scan: { en: 1000 } }, name: 'x' });
    expect(() => setAtPath(params, 'timing.nope', '1')).toThrow(/no number or switch/);
    expect(() => setAtPath(params, 'missing.value', '1')).toThrow(/not a group/);
    expect(() => setAtPath(params, 'name', '1')).toThrow(/no number or switch/);
    expect(() => setAtPath(params, 'timing.multiplierFloor', 'high')).toThrow(/not a number/);
    expect(() => setAtPath(params, 'timing.multiplierFloor', '')).toThrow(/not a number/);
    expect(() => setAtPath(params, 'timing.on', 'yes')).toThrow(/true or false/);
    expect(() => setAtPath(params, '__proto__.polluted', '1')).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('is the parameters in force with the given values, under an unused number, and leaves the real ones alone', () => {
    const algo = registerTrialAlgo(931, ['timing.multiplierFloor=1']);
    expect(algo.version).toBe(931);
    expect(getAlgo(931).timing.multiplierFloor).toBe(1);
    expect(getAlgo(931).timing.scanPerMinute).toEqual(getAlgo(CURRENT.algo).timing.scanPerMinute);
    expect(ALGO_PARAMS[CURRENT.algo].timing.multiplierFloor).toBe(0.5);
    expect(getAlgo(CURRENT.algo).timing.multiplierFloor).toBe(0.5);
    expect(() => registerTrialAlgo(931, [])).toThrow(/Algorithm 931 is registered/);
    expect(() => registerTrialAlgo(CURRENT.algo, ['timing.multiplierFloor=1'])).toThrow(/is registered/);
    expect(() => registerTrialAlgo(932, ['timing.multiplierFloor'])).toThrow(/path=value/);
    expect(Object.hasOwn(ALGOS, 932)).toBe(false);
  });
});

describe('applying migrations', () => {
  it('applies every file in name order once, and nothing on a second run', async () => {
    const raw = new PGlite();
    await raw.waitReady;
    const db = wrapPglite(raw);
    const files = readMigrationFiles();
    expect(files.map((f) => f.name)).toEqual([
      '0001_init.sql',
      '0002_not_applicable.sql',
      '0003_compare.sql',
      '0004_version_log.sql',
      '0005_micro_apps.sql',
      '0006_row_level_security.sql',
    ]);
    const now = () => '2026-03-01T00:00:00.000Z';
    expect(await migrate(db, files, now)).toEqual(files.map((f) => f.name));
    expect(await migrate(db, files, now)).toEqual([]);
    expect((await db.query<{ name: string }>('select name from _migrations order by name')).map((r) => r.name)).toEqual(files.map((f) => f.name));
    // Every table has row level security on, so the Supabase Data API serves none of them.
    const open = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by c.relname`,
    );
    expect(open.map((r) => r.relname)).toEqual([]);
    // The app is the owner of the tables and still reads and writes them.
    await db.query(`insert into version_log (kind, version, effective_day, logged_at) values ('algo', '2', '2026-03-01', $1)`, [now()]);
    expect(await db.query('select kind from version_log')).toHaveLength(1);
    // A database that stopped at 0001 gets only what is new.
    const old = new PGlite();
    await old.waitReady;
    const oldDb = wrapPglite(old);
    await migrate(oldDb, files.slice(0, 1), now);
    expect(await migrate(oldDb, files, now)).toEqual(files.slice(1).map((f) => f.name));
    await raw.close();
    await old.close();
  });
});
