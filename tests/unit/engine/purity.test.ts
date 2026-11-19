// Acceptance E (part): the engine is pure. It runs the same in the browser and on the server,
// reads no clock, draws no random number and touches no global of either environment.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, BANKS, BANK_BANDS, CURRENT, NORMS, compute, displayOrder, getAlgo, nextQuestion } from '../../../src/engine';
import { backgroundFor, bank, walk } from './helpers';

const ENGINE = fileURLToPath(new URL('../../../src/engine', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ['Math.random', /Math\s*\.\s*random/],
  ['Date.now', /Date\s*\.\s*now/],
  ['new Date', /new\s+Date\b/],
  ['Date(', /\bDate\s*\(/],
  ['Intl.', /\bIntl\s*\./],
  ['toLocale...', /\.\s*toLocale\w*\s*\(/],
  ['performance.now', /performance\s*\.\s*now/],
  ['crypto', /\bcrypto\s*\./],
  ['document.', /\bdocument\s*\./],
  ['window.', /\bwindow\s*\./],
  ['navigator.', /\bnavigator\s*\./],
  ['localStorage', /\b(local|session)Storage\b/],
  ['globalThis', /\bglobalThis\b/],
  ['process.', /\bprocess\s*\./],
  ['require(', /\brequire\s*\(/],
  ['node: imports', /from\s+['"]node:/],
  ['fetch(', /\bfetch\s*\(/],
  ['console.', /\bconsole\s*\./],
  ['setTimeout', /\bset(Timeout|Interval)\b/],
];

// Built from its code point so that this file does not contain the character itself.
const EM_DASH = String.fromCharCode(0x2014);

describe('engine purity', () => {
  const files = sources(ENGINE);

  it('finds the engine sources', () => {
    const names = files.map((f) => relative(ENGINE, f));
    expect(names).toEqual(expect.arrayContaining(['index.ts', 'config.ts', 'registry.ts', 'types.ts', join('algo', 'v1', 'compute.ts')]));
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it('the patterns catch what they name', () => {
    const samples = [
      'const r = Math.random();',
      'const t = Date.now();',
      'const d = new Date();',
      'const now = Date();',
      'new Intl.NumberFormat("en").format(x)',
      'price.toLocaleString()',
      'performance.now()',
      'crypto.getRandomValues(a)',
      'document.title',
      'window.scrollTo(0, 0)',
      'navigator.language',
      'localStorage.getItem(k)',
      'globalThis.x',
      'process.env.X',
      "const fs = require('fs');",
      "import { x } from 'node:fs';",
      'await fetch(url)',
      'console.log(1)',
      'setTimeout(f, 1)',
    ];
    expect(samples).toHaveLength(FORBIDDEN.length);
    FORBIDDEN.forEach(([name, pattern], i) => expect(pattern.test(samples[i]), name).toBe(true));
    // Ordinary engine code is not caught.
    const fine =
      'const windowDays = params.dailyOpen.windowDays; const processed = documentCount.total; const update = lastUpdate(x); const internal = 1;';
    for (const [name, pattern] of FORBIDDEN) expect(pattern.test(fine), name).toBe(false);
  });

  it.each(FORBIDDEN)('no engine source uses %s', (_name, pattern) => {
    const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => relative(ENGINE, f));
    expect(hits).toEqual([]);
  });

  it('imports nothing from outside the engine', () => {
    const outside: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = match[1];
        const inside = target.startsWith('./') || (target.startsWith('../') && !relative(ENGINE, join(f, '..', target)).startsWith('..'));
        if (!inside) outside.push(`${relative(ENGINE, f)} imports ${target}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('has no em dash in sources', () => {
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes(EM_DASH)).map((f) => relative(ENGINE, f));
    expect(hits).toEqual([]);
  });

  it('gives the same output for the same input, every time', () => {
    const background = backgroundFor('gig', { money: 2 });
    const steps = walk(background, (q) => q.index % q.version.opts.length, { secs: 0.7, lang: 'en' });
    const first = JSON.stringify(compute({ bank, background, steps }));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(compute({ bank, background, steps }))).toBe(first);
    const question = nextQuestion(bank, background, steps.slice(0, 7));
    expect(nextQuestion(bank, background, steps.slice(0, 7))).toEqual(question);
    expect(displayOrder(question!.version, 0.3)).toEqual(displayOrder(question!.version, 0.3));
  });

  it('compute cannot be made to differ by writing to a shared table: they are frozen', () => {
    for (const table of [ALGO_PARAMS, ALGO_PARAMS[1], ALGO_PARAMS[1].flags.points, NORMS, NORMS[CURRENT.norm].sectors, BANK_BANDS, BANKS, bank, bank.items]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
    expect(Object.isFrozen(getAlgo())).toBe(true);
  });

  it('results survive JSON: no NaN, no undefined, no functions', () => {
    const background = backgroundFor('seek', { exp: 0 });
    const steps = walk(background, (q) => (q.index % 3 === 0 ? null : 1), { secs: 0.4 });
    const result = compute({ bank, background, steps });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
