// Acceptance E (part): display order, pins, whereOf, and the time thresholds in both languages.

import { describe, expect, it } from 'vitest';
import {
  ALGO_PARAMS,
  EngineError,
  compute,
  displayOrder,
  displayOrderFor,
  multiplierFor,
  orderDirection,
  readUnits,
  thresholdFor,
  whereOf,
} from '../../../src/engine';
import type { ItemVersion, Lang, Step } from '../../../src/engine';
import { backgroundFor, bank, walk } from './helpers';

const versions: Array<[string, ItemVersion]> = Object.entries(bank.items).flatMap(([id, item]) =>
  item.versions.map((v): [string, ItemVersion] => [`${id}:${v.key}`, v]),
);

describe('display order', () => {
  const fitness = bank.items.B4.versions[0];
  const interest = bank.items.C_int.versions[0];
  const sleep = bank.items.B3.versions[0];

  it('a random number below 0.5 reverses the bank order (best_first), otherwise keeps it (worst_first)', () => {
    expect(orderDirection(0)).toBe('best_first');
    expect(orderDirection(0.4999)).toBe('best_first');
    expect(orderDirection(0.5)).toBe('worst_first');
    expect(orderDirection(0.9999)).toBe('worst_first');
    expect(displayOrder(sleep, 0.2)).toEqual([4, 3, 2, 1, 0]);
    expect(displayOrder(sleep, 0.7)).toEqual([0, 1, 2, 3, 4]);
  });

  it('matches displayOrder() and record() of the reference page: all 93 versions, both directions, every option', () => {
    /** displayOrder(v) of test_page.html with Math.random() replaced by r. It reverses; it never sorts by score. */
    const pageOrder = (v: ItemVersion, r: number): number[] => {
      const free = v.opts.map((_, k) => k).filter((k) => !v.pin.includes(k));
      if (r < 0.5) free.reverse();
      return free.concat(v.pin);
    };
    /** The `where` argument record() receives in renderQ, with "mid" spelled "middle". */
    const pageWhere = (i: number, order: number[]): string => (i === 0 ? 'first' : i === order.length - 1 ? 'last' : 'middle');
    expect(versions).toHaveLength(93);
    for (const [, v] of versions) {
      for (const r of [0, 0.25, 0.4999999, 0.5, 0.75, 0.9999999]) {
        const order = displayOrder(v, r);
        expect(order).toEqual(pageOrder(v, r));
        order.forEach((k, i) => expect(whereOf(k, order)).toBe(pageWhere(i, order)));
      }
    }
  });

  it('the direction names are labels: best_first opens with the highest score everywhere except sleep', () => {
    // The bank lists options from the lowest score to the highest, except B3: "7 to 9" hours
    // scores 1 and "More than 9" scores 0.625. The order shown is right (the page only
    // reverses), so the label is nominal for B3. Dashboard analysis by direction must read
    // best_first as "reversed", not as "highest score first".
    expect(sleep.s).toEqual([0, 0.25, 0.625, 1, 0.625]);
    const notHighestFirst = versions
      .filter(([, v]) => {
        const first = displayOrderFor(v, 'best_first')[0];
        return v.s[first] !== Math.max(...v.s.map((x) => (x === null ? -1 : x)));
      })
      .map(([name]) => name);
    expect(notHighestFirst).toEqual(['B3:base']);
    expect(displayOrderFor(sleep, 'best_first')[0]).toBe(4);
    expect(sleep.opts[4].en).toBe('More than 9');
  });

  it('displayOrderFor rebuilds the displayed order from a stored direction, without a random number', () => {
    for (const [, v] of versions) {
      expect(displayOrderFor(v, 'best_first')).toEqual(displayOrder(v, 0.1));
      expect(displayOrderFor(v, 'worst_first')).toEqual(displayOrder(v, 0.9));
      expect(displayOrderFor(v, orderDirection(0.3))).toEqual(displayOrder(v, 0.3));
    }
    // Enough to verify a reported tap position after the fact.
    expect(whereOf(6, displayOrderFor(fitness, 'best_first'))).toBe('last');
    expect(whereOf(5, displayOrderFor(fitness, 'best_first'))).toBe('first');
    expect(whereOf(5, displayOrderFor(fitness, 'worst_first'))).toBe('middle');
  });

  it('pinned options stay last in both directions', () => {
    // "Not applicable" (index 6) is pinned.
    expect(fitness.pin).toEqual([6]);
    expect(displayOrder(fitness, 0.1)).toEqual([5, 4, 3, 2, 1, 0, 6]);
    expect(displayOrder(fitness, 0.9)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // "Don't know" (index 0) is pinned.
    expect(interest.pin).toEqual([0]);
    expect(displayOrder(interest, 0.1)).toEqual([3, 2, 1, 0]);
    expect(displayOrder(interest, 0.9)).toEqual([1, 2, 3, 0]);
  });

  it('a pin is about position only: the pinned "don\'t know" still scores 0', () => {
    expect(interest.s[0]).toBe(0);
    expect(fitness.s[6]).toBeNull();
  });

  it.each(versions)('%s: every option exactly once, pins last, reverse of the other direction', (_name, v) => {
    const best = displayOrder(v, 0.25);
    const worst = displayOrder(v, 0.75);
    const all = v.opts.map((_, k) => k);
    expect([...best].sort((a, b) => a - b)).toEqual(all);
    expect([...worst].sort((a, b) => a - b)).toEqual(all);
    const free = all.length - v.pin.length;
    expect(best.slice(free)).toEqual(v.pin);
    expect(worst.slice(free)).toEqual(v.pin);
    expect(best.slice(0, free)).toEqual(worst.slice(0, free).reverse());
    expect(worst.slice(0, free)).toEqual(all.filter((k) => !v.pin.includes(k)));
  });

  it('does not draw randomness itself: the same number gives the same order', () => {
    for (const r of [0, 0.3, 0.5, 0.99]) expect(displayOrder(fitness, r)).toEqual(displayOrder(fitness, r));
  });

  it('whereOf names the tapped position', () => {
    const order = displayOrder(fitness, 0.1);
    expect(whereOf(5, order)).toBe('first');
    expect(whereOf(3, order)).toBe('middle');
    expect(whereOf(0, order)).toBe('middle');
    expect(whereOf(6, order)).toBe('last');
    expect(whereOf(0, displayOrder(fitness, 0.9))).toBe('first');
    expect(whereOf(0, displayOrder(interest, 0.9))).toBe('last');
    expect(() => whereOf(9, order)).toThrow(EngineError);
  });
});

describe('reading units', () => {
  it('English counts words', () => {
    expect(readUnits('Which year are you in?', 'en')).toBe(5);
    expect(readUnits('  Which   year are\nyou in?  ', 'en')).toBe(5);
    expect(readUnits('Suppose you had $100 in a savings account', 'en')).toBe(8);
  });

  it('Chinese counts characters, and a run of Latin letters, digits and $ , . % as one unit', () => {
    expect(readUnits('你的年龄段', 'zh')).toBe(5);
    // 16 characters, plus "$2,000" as one unit. Punctuation is not counted.
    expect(readUnits('假如你突然需要支付一笔 $2,000 的紧急开支', 'zh')).toBe(16 + 1);
    // 9 characters, plus "2%" and "5".
    expect(readUnits('年利率 2%。5 年后有多少钱？', 'zh')).toBe(9 + 2);
    expect(readUnits('（MBA、JD、MD）', 'zh')).toBe(3);
  });

  // [text, read_units(text, "zh"), read_units(text, "en")], printed by python3 from
  // reference/python/items2.py.
  const fromPython: Array<[string, number, number]> = [
    ['word', 1, 1],
    ['  two  words ', 2, 2],
    ['a\u2028b', 2, 2],
    ['a\u3000b', 2, 2],
    ['a\u00a0b', 2, 2],
    ['a\u200bb', 2, 1],
    ['$2,000', 1, 1],
    ['假如你突然需要支付一笔 $2,000 的紧急开支', 17, 3],
    ['年利率 2%。5 年后有多少钱？', 11, 3],
    ['（MBA、JD、MD）', 3, 1],
    ['你用 Excel 或 Python 吗？', 6, 5],
    ['3.5% 的利率，$1,000.50', 5, 2],
    ['A.B,C%$', 1, 1],
    ['１２３ ＡＢＣ', 0, 2],
    ['〇一二', 2, 1],
    ['\u{20000}\u{20001}', 0, 1],
    ['㐀㐁', 0, 1],
    ['鿿一', 2, 1],
    ['龥', 1, 1],
    ["It's $100 -- or 5%?", 5, 5],
    ['e-mail  co-op', 4, 2],
    ['a,b . c', 3, 3],
    ['401(k) 或 IRA', 4, 3],
    ['第 1 至 2 级', 5, 5],
    ['U.S.A.', 1, 1],
    ['…', 0, 1],
    ['，。！？', 0, 1],
    ['한국어 にほんご', 0, 2],
    ['café naïve', 3, 2],
    ['2,200字/分钟', 4, 1],
    // A blank string has no words. The test page gives 1 here; the engine follows items2.py.
    ['', 0, 0],
    [' ', 0, 0],
    ['   \n\t ', 0, 0],
  ];

  it.each(fromPython)('agrees with read_units of items2.py on %j: zh %i, en %i', (text, zh, en) => {
    expect(readUnits(text, 'zh')).toBe(zh);
    expect(readUnits(text, 'en')).toBe(en);
  });

  it('a blank stem still gets the minimum threshold', () => {
    expect(thresholdFor('', 'en')).toBe(0.6);
    expect(thresholdFor('   ', 'en')).toBe(0.6);
    expect(thresholdFor('', 'zh')).toBe(0.6);
  });

  it('splits English on JavaScript whitespace, as the test page does (known difference from Python on rare separators)', () => {
    // Python's str.split also splits on U+001C to U+001F and U+0085, and not on U+FEFF.
    // JavaScript is the other way round. No stem of the bank contains any of them.
    expect(readUnits('a\ufeffb', 'en')).toBe(2);
    expect(readUnits('a\u001cb', 'en')).toBe(1);
    expect(readUnits('a\u0085b', 'en')).toBe(1);
    const rare = /[\u001c-\u001f\u0085\ufeff]/;
    for (const [name, v] of versions) expect(rare.test(v.q.en) || rare.test(v.q.zh), name).toBe(false);
  });
});

describe('time threshold', () => {
  const timing = ALGO_PARAMS[1].timing;

  it('is the stem length over the glance speed, clamped to 0.6 and 2.0 seconds', () => {
    // 2,200 characters a minute: 44 characters take 1.2 seconds.
    expect(thresholdFor('字'.repeat(44), 'zh')).toBeCloseTo(1.2, 12);
    expect(thresholdFor('字'.repeat(5), 'zh')).toBe(0.6);
    expect(thresholdFor('字'.repeat(500), 'zh')).toBe(2);
    // 1,400 words a minute: 28 words take 1.2 seconds.
    expect(thresholdFor(Array(28).fill('word').join(' '), 'en')).toBeCloseTo(1.2, 12);
    expect(thresholdFor('Two words', 'en')).toBe(0.6);
    expect(thresholdFor(Array(200).fill('word').join(' '), 'en')).toBe(2);
  });

  it('takes other parameters when given', () => {
    const slow = { ...timing, scanPerMinute: { zh: 1100, en: 700 } };
    expect(thresholdFor('字'.repeat(22), 'zh', slow)).toBeCloseTo(1.2, 12);
    expect(thresholdFor(Array(14).fill('word').join(' '), 'en', slow)).toBeCloseTo(1.2, 12);
    expect(thresholdFor('字', 'zh', { ...timing, thresholdMinSeconds: 0.9 })).toBe(0.9);
  });

  // Printed by `python3 items2.py`: zh min 0.6 median 0.79 max 2.0, en min 0.6 median 0.86 max 2.0.
  it.each([
    ['zh', 0.79],
    ['en', 0.86],
  ] as Array<[Lang, number]>)('over all 93 versions in %s: min 0.6, median %f, max 2.0', (lang, median) => {
    const all = versions.map(([, v]) => thresholdFor(v.q[lang], lang)).sort((a, b) => a - b);
    expect(all).toHaveLength(93);
    expect(all[0]).toBe(0.6);
    expect(all[all.length - 1]).toBe(2);
    expect(Math.round(all[Math.floor(all.length / 2)] * 100) / 100).toBe(median);
  });

  it('the two languages give different thresholds for the same question', () => {
    const stem = bank.items.C_rec.versions[0].q;
    expect(thresholdFor(stem.zh, 'zh')).not.toBe(thresholdFor(stem.en, 'en'));
  });
});

describe('time multiplier', () => {
  it('is seconds over threshold, between 0.5 and 1; untimed answers count in full', () => {
    expect(multiplierFor(null, 1.2)).toBe(1);
    expect(multiplierFor(5, 1.2)).toBe(1);
    expect(multiplierFor(1.2, 1.2)).toBe(1);
    expect(multiplierFor(0.9, 1.2)).toBeCloseTo(0.75, 12);
    expect(multiplierFor(0.6, 1.2)).toBe(0.5);
    expect(multiplierFor(0.1, 1.2)).toBe(0.5);
    expect(multiplierFor(0, 1.2)).toBe(0.5);
    expect(multiplierFor(0.3, 1.2, { ...ALGO_PARAMS[1].timing, multiplierFloor: 0.2 })).toBeCloseTo(0.25, 12);
  });

  it('compute uses the language shown when the answer was given', () => {
    const background = backgroundFor('ug4');
    const base = walk(background, () => 2);
    const id = 'C_rec';
    const stem = bank.items[id].versions[0].q;
    const zh = thresholdFor(stem.zh, 'zh');
    const en = thresholdFor(stem.en, 'en');
    // A time between the two thresholds is fast in one language and slow enough in the other.
    const secs = (zh + en) / 2;
    const answered = (lang: Lang) => base.map((s): Step => (s.id === id ? { ...s, secs, lang } : s));
    const inZh = compute({ bank, background, steps: answered('zh') }).steps.find((s) => s.id === id)!;
    const inEn = compute({ bank, background, steps: answered('en') }).steps.find((s) => s.id === id)!;
    expect(inZh.threshold).toBe(zh);
    expect(inEn.threshold).toBe(en);
    expect(inZh.multiplier).toBe(multiplierFor(secs, zh));
    expect(inEn.multiplier).toBe(multiplierFor(secs, en));
    expect(Math.min(inZh.multiplier, inEn.multiplier)).toBeLessThan(1);
    expect(Math.max(inZh.multiplier, inEn.multiplier)).toBe(1);
  });

  it('fast answers are counted, reported and pull the price toward 100', () => {
    const background = backgroundFor('emp');
    const slow = walk(background, (q) => q.version.opts.length - 1, { secs: 10 });
    const fast = slow.map((s, i): Step => (i < 12 ? { ...s, secs: 0.05 } : s));
    const full = compute({ bank, background, steps: slow });
    const result = compute({ bank, background, steps: fast });
    expect(full.reducedWeight).toEqual({ count: 0, points: 0 });
    expect(result.reducedWeight.count).toBe(12);
    expect(result.keepAll).toBeCloseTo((12 * 0.5 + 22) / 34, 12);
    expect(result.overallFullWeight).toBeCloseTo(full.overall as number, 9);
    expect(result.reducedWeight.points).toBeCloseTo(Math.abs((result.overallFullWeight as number) - (result.overall as number)), 12);
    expect(result.reducedWeight.points as number).toBeGreaterThan(0);
    expect(Math.abs((result.overall as number) - 100)).toBeLessThan(Math.abs((full.overall as number) - 100));
  });
});
