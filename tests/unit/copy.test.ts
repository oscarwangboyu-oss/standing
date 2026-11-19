// The copy rules of CLAUDE.md that a pattern can check, over every string in src/copy:
// no em dash or en dash, no exclamation mark, no "not X but Y". The rest of the rules (short
// declarative sentences, one market vocabulary, strengths first) need a reader.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src', 'copy');

interface Literal {
  file: string;
  line: number;
  text: string;
}

/** Every string literal of the copy files, comments left out. */
function literals(): Literal[] {
  const found: Literal[] = [];
  for (const file of readdirSync(DIR).filter((name) => name.endsWith('.ts')).sort()) {
    let inBlockComment = false;
    readFileSync(join(DIR, file), 'utf8')
      .split('\n')
      .forEach((raw, index) => {
        const line = raw.trim();
        if (inBlockComment) {
          if (line.includes('*/')) inBlockComment = false;
          return;
        }
        if (line.startsWith('/*')) {
          if (!line.includes('*/')) inBlockComment = true;
          return;
        }
        if (line.startsWith('//') || line.startsWith('*')) return;
        for (const match of line.matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
          found.push({ file, line: index + 1, text: match[0].slice(1, -1) });
        }
      });
  }
  return found;
}

const where = (hits: Literal[]): string[] => hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`);

describe('interface copy', () => {
  const all = literals();

  it('finds the copy', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it('has no em dash and no en dash', () => {
    expect(where(all.filter((l) => /[—–]/.test(l.text)))).toEqual([]);
  });

  it('has no exclamation mark', () => {
    expect(where(all.filter((l) => l.text.includes('!')))).toEqual([]);
  });

  it('has no "not X but Y"', () => {
    expect(where(all.filter((l) => /\bnot (only )?[^.,;:]{1,40}\bbut\b/i.test(l.text)))).toEqual([]);
  });
});
