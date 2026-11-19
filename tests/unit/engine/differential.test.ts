// Differential fuzzing of the TypeScript engine against both references.
//
// 660 seeded random sessions (60 for each of the 11 roles; both languages and sessions that
// switch language mid-way; random backgrounds, option choices and answer times, including
// null, zero, negative and very fast times) are walked on the reference page itself
// (reference/test_page.html run in node:vm), then replayed through the TypeScript engine and
// through reference/python/items2.py. Everything the three can be compared on is compared to
// 1e-9: question path, total, context, display order, thresholds, multipliers, sector values,
// prices, overall, flags, grade, contrasts, mind notice, rank, social position, and the
// market line, tags and type that renderResult() prints.
//
// One line is compared differently on purpose. For the movers the engine departs from the
// page: a sector that did not move is not counted as up or down (see changeOf in
// src/engine/algo/v1/market.ts). Where every compared sector moved, the engine must print
// the page's sentence. Where one did not, the engine must return some_up, some_down or
// unchanged and the page's sentence is not expected.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALGO_PARAMS, compute, contextOf, displayOrder, multiplierFor, nextQuestion, thresholdFor, whereOf } from '../../../src/engine';
import type { AreaId, Background, Lang, Result, RoleId, Step, Where } from '../../../src/engine';
import { AREAS, bank, near } from './helpers';
import { loadReferencePage } from './differential/reference-page';
import type { RefResult, SavedRecord } from './differential/reference-page';

// REVIEW_FUZZ_PER_ROLE and REVIEW_FUZZ_SEED widen or move the fuzz for a one-off run.
const SESSIONS_PER_ROLE = Number(process.env.REVIEW_FUZZ_PER_ROLE ?? 60);
const SEED = Number(process.env.REVIEW_FUZZ_SEED ?? 20261119);

/** Small seeded generator, so every run walks the same sessions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHOICE_MODES = ['rand', 'rand', 'rand', 'best', 'worst', 'extreme', 'firstShown', 'lastShown', 'lowMood'] as const;
const TIME_MODES = ['none', 'fast', 'around', 'slow', 'mixed', 'mixed', 'edge'] as const;
const LANG_MODES = ['zh', 'en', 'switch'] as const;
const PREVIOUS_MODES = ['none', 'up', 'down', 'mixed', 'same', 'partial'] as const;

interface Session {
  n: number;
  role: RoleId;
  age: number;
  background: Record<string, number>;
  choice: (typeof CHOICE_MODES)[number];
  time: (typeof TIME_MODES)[number];
  langMode: (typeof LANG_MODES)[number];
  previousMode: (typeof PREVIOUS_MODES)[number];
  steps: Array<{ id: string; key: string; k: number; secs: number | null; lang: Lang; where: string; rng: number; order: number[] }>;
  /** True when `where` was drawn at random instead of read off the display order. */
  looseWhere: boolean;
  previous: Record<string, number | null> | null;
  ref: RefResult;
  refNoPrevious: RefResult;
  problems: string[];
  /** Kind the engine returned where its movers depart from the page on purpose. */
  moversDeparture?: string | null;
}

const WHERE: Record<string, Where> = { first: 'first', mid: 'middle', last: 'last' };
const sgn = (d: number): string => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);

function describeInput(s: Session): string {
  return JSON.stringify({
    session: s.n,
    role: s.role,
    age: s.age,
    background: s.background,
    modes: [s.choice, s.time, s.langMode, s.previousMode],
    steps: s.steps.map((x) => [x.id, x.key, x.k, x.secs, x.lang, x.where]),
    previous: s.previous,
  });
}

function pickTime(mode: Session['time'], rnd: () => number): number | null {
  const one = (kind: string): number | null => {
    switch (kind) {
      case 'none':
        return null;
      case 'fast':
        return rnd() * 0.6;
      case 'around':
        return rnd() * 2.5;
      case 'slow':
        return 2 + rnd() * 40;
      default: {
        // Edge values: zero, negative (clock stepped back), tiny, the clamp limits, whole milliseconds.
        const edges = [0, -0.25, 1e-12, 0.3, 0.6, 2, 2.0000001, 0.5999999, Math.round(rnd() * 3000) / 1000];
        return edges[Math.floor(rnd() * edges.length)];
      }
    }
  };
  if (mode === 'mixed') return one(['none', 'fast', 'around', 'slow', 'edge'][Math.floor(rnd() * 5)]);
  return one(mode);
}

/** Walks every session on the reference page and returns what the page computed. */
function generate(): Session[] {
  const page = loadReferencePage();
  const rnd = mulberry32(SEED);
  const int = (n: number): number => Math.floor(rnd() * n);
  const sessions: Session[] = [];
  let n = 0;
  for (const role of bank.roles) {
    for (let i = 0; i < SESSIONS_PER_ROLE; i++) {
      const background: Record<string, number> = {};
      for (const q of bank.extra[role.id]) background[q.id] = int(q.opts.length);
      // The youngest group is drawn more often: checks f6 and f7 need it.
      const age = rnd() < 0.3 ? 0 : int(bank.ages.length);
      const s: Session = {
        n: n++,
        role: role.id,
        age,
        background,
        choice: CHOICE_MODES[int(CHOICE_MODES.length)],
        time: TIME_MODES[int(TIME_MODES.length)],
        langMode: LANG_MODES[int(LANG_MODES.length)],
        previousMode: PREVIOUS_MODES[int(PREVIOUS_MODES.length)],
        steps: [],
        looseWhere: false,
        previous: null,
        ref: null as unknown as RefResult,
        refNoPrevious: null as unknown as RefResult,
        problems: [],
      };
      const baseLang: Lang = s.langMode === 'switch' ? (rnd() < 0.5 ? 'zh' : 'en') : s.langMode;
      const looseWhere = rnd() < 0.1;
      s.looseWhere = looseWhere;
      page.begin(baseLang, age, role.id, background);
      for (let cur = page.current(); cur !== null; cur = page.current()) {
        const version = bank.items[cur.id].versions.find((v) => v.key === cur.key);
        if (!version) throw new Error(`reference asked ${cur.id}:${cur.key}, which the bank does not have`);
        const lang: Lang = s.langMode === 'switch' ? (rnd() < 0.5 ? 'zh' : 'en') : baseLang;
        const rng = rnd();
        const order = page.displayOrder(rng);
        const scored = version.s.map((x, k) => (x === null ? -1 : k)).filter((k) => k >= 0);
        const best = scored.reduce((a, b) => ((version.s[b] as number) > (version.s[a] as number) ? b : a));
        const worst = scored.reduce((a, b) => ((version.s[b] as number) < (version.s[a] as number) ? b : a));
        let k: number;
        switch (s.choice) {
          case 'best':
            k = best;
            break;
          case 'worst':
            k = worst;
            break;
          case 'extreme':
            k = rnd() < 0.5 ? best : worst;
            break;
          case 'firstShown':
            k = order[0];
            break;
          case 'lastShown':
            k = order[order.length - 1];
            break;
          case 'lowMood':
            k = cur.id === 'M3' || cur.id === 'M4' ? 0 : int(cur.options);
            break;
          default:
            k = int(cur.options);
        }
        const position = order.indexOf(k);
        const where = looseWhere
          ? ['first', 'mid', 'last'][int(3)]
          : position === 0
            ? 'first'
            : position === order.length - 1
              ? 'last'
              : 'mid';
        const secs = pickTime(s.time, rnd);
        page.setLang(lang);
        page.record(k, secs, where);
        s.steps.push({ id: cur.id, key: cur.key, k, secs, lang, where, rng, order });
      }
      page.setLang(baseLang);
      s.refNoPrevious = page.finish(null);
      if (s.previousMode !== 'none') {
        const previous: Record<string, number | null> = {};
        for (const a of AREAS) {
          const now = s.refNoPrevious.idx[a] as number;
          const move = rnd() * 12;
          previous[a] =
            s.previousMode === 'same'
              ? now
              : s.previousMode === 'up'
                ? now - move
                : s.previousMode === 'down'
                  ? now + move
                  : s.previousMode === 'partial' && rnd() < 0.5
                    ? null
                    : now + (rnd() < 0.5 ? move : -move);
        }
        s.previous = previous;
        const saved: SavedRecord = {
          label: 'TEST',
          ts: '2026-01-01T00:00:00.000Z',
          role: role.id,
          idx: previous,
          raw: {},
          overall: 100,
          grade: 'A',
        };
        s.ref = page.finish(saved);
      } else {
        s.ref = s.refNoPrevious;
      }
      sessions.push(s);
    }
  }
  return sessions;
}

interface ParsedHtml {
  talk: string;
  tags: Record<string, string>;
  type: string | null;
}

function parseHtml(html: string): ParsedHtml {
  const talk = /<div class="talk">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  const tags: Record<string, string> = {};
  for (const m of html.matchAll(/<tr><td class="tk">(\w+)<\/td><td>[^<]*(?:<span class="tag (?:up|down)">([^<]*)<\/span>)?<\/td><td class="r">/g)) {
    tags[m[1]] = m[2] ?? '';
  }
  const type = /<h3>(?:类型|Type)<\/h3><p>([^<]*)<\/p>/.exec(html)?.[1] ?? null;
  return { talk, tags, type };
}

const TEXT = {
  zh: {
    flat: '五个板块齐头并进。',
    talk1: (a: string, b: string) => `${a} 是你的龙头板块，${b} 相对落后。`,
    talk1m: (a: string) => `${a} 是你的龙头板块。`,
    talk2: (g: string, gv: string, l: string, lv: string) => `和上次相比，${g} 领涨（${gv}），${l} 领跌（${lv}）。`,
    talkUp: (g: string, gv: string) => `和上次相比全线上涨，${g} 涨幅最大（${gv}）。`,
    talkDown: (l: string, lv: string) => `和上次相比全线下跌，${l} 跌幅最大（${lv}）。`,
    tag: { leader: '龙头', laggard: '垫底', limit_up: '涨停', limit_down: '跌停' },
    type: (a: string, b: string) => `${a} + ${b} 型`,
  },
  en: {
    flat: 'All five sectors are level.',
    talk1: (a: string, b: string) => `${a} is your leading sector and ${b} is lagging.`,
    talk1m: (a: string) => `${a} is your leading sector.`,
    talk2: (g: string, gv: string, l: string, lv: string) =>
      `Since the last check ${g} gained most (${gv}) and ${l} fell most (${lv}).`,
    talkUp: (g: string, gv: string) => `Every sector is up since the last check; ${g} gained most (${gv}).`,
    talkDown: (l: string, lv: string) => `Every sector is down since the last check; ${l} fell most (${lv}).`,
    tag: { leader: 'Leader', laggard: 'Laggard', limit_up: 'Limit up', limit_down: 'Limit down' },
    type: (a: string, b: string) => `${a} + ${b}`,
  },
} as const;

/** The market line the reference would print for the data the TypeScript engine returned. */
function talkFrom(result: Result, lang: Lang): string {
  const L = TEXT[lang];
  const tick = (a: AreaId): string => bank.areas[a].tick;
  const m = result.market;
  let talk: string = m.flat
    ? L.flat
    : m.leader !== null && m.laggard !== null
      ? L.talk1(tick(m.leader), tick(m.laggard))
      : m.leader !== null
        ? L.talk1m(tick(m.leader))
        : '(no leader)';
  const c = m.change;
  if (c) {
    if (c.kind === 'all_up' && c.topGainer) talk += ' ' + L.talkUp(tick(c.topGainer.area), sgn(c.topGainer.delta));
    else if (c.kind === 'all_down' && c.topLoser) talk += ' ' + L.talkDown(tick(c.topLoser.area), sgn(c.topLoser.delta));
    else if (c.kind === 'mixed' && c.topGainer && c.topLoser) {
      talk += ' ' + L.talk2(tick(c.topGainer.area), sgn(c.topGainer.delta), tick(c.topLoser.area), sgn(c.topLoser.delta));
    }
  }
  return talk;
}

/** A sector that moved this little is unchanged (params.market.unchangedBand). */
const UNCHANGED_BAND = ALGO_PARAMS[1].market.unchangedBand;

/**
 * True when the engine's movers depart from the page on purpose: at least one compared sector
 * did not move, and the engine says so with some_up, some_down or unchanged.
 */
function departsOnMovers(result: Result): boolean {
  const c = result.market.change;
  if (!c) return false;
  const still = Object.values(c.deltas).some((d) => Math.abs(d) <= UNCHANGED_BAND);
  return still && (c.kind === 'some_up' || c.kind === 'some_down' || c.kind === 'unchanged');
}

function compareWithPage(s: Session): void {
  const add = (text: string): void => {
    s.problems.push(text);
  };
  const same = (label: string, actual: unknown, expected: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      add(`${label}: engine ${JSON.stringify(actual)}, reference page ${JSON.stringify(expected)}`);
    }
  };
  const close = (label: string, actual: number | null | undefined, expected: number | null | undefined): void => {
    if (!near(actual, expected)) add(`${label}: engine ${actual}, reference page ${expected}`);
  };
  const ref = s.ref;
  const background: Background = { age: s.age, role: s.role, extra: s.background };

  const steps: Step[] = [];
  s.steps.forEach((g, i) => {
    const q = nextQuestion(bank, background, steps);
    if (q === null) {
      add(`step ${i}: engine ended, reference page asked ${g.id}:${g.key}`);
      return;
    }
    same(`step ${i} question`, [q.id, q.key, q.index, q.total], [g.id, g.key, i, ref.total]);
    if (q.id !== g.id || q.key !== g.key) return;
    const order = displayOrder(q.version, g.rng);
    // g.order is what displayOrder() of the reference page returned for the same random number.
    same(`step ${i} display order`, order, g.order);
    if (!s.looseWhere) same(`step ${i} where`, whereOf(g.k, order), WHERE[g.where]);
    const threshold = thresholdFor(q.version.q[g.lang], g.lang);
    close(`step ${i} threshold`, threshold, ref.steps[i].thr);
    close(`step ${i} multiplier`, multiplierFor(g.secs, threshold), ref.steps[i].mult);
    steps.push({ id: g.id, key: g.key, k: g.k, secs: g.secs, lang: g.lang, where: WHERE[g.where], source: 'questionnaire' });
  });
  if (steps.length !== s.steps.length) return;
  same('questionnaire ends', nextQuestion(bank, background, steps), null);

  let result: Result;
  try {
    result = compute({ bank, background, steps, previous: s.previous });
  } catch (e) {
    add(`compute threw: ${String(e)}`);
    return;
  }
  for (const key of ['role', 'money', 'field', 'nowork', 'tier', 'mgr'] as const) {
    same(`context ${key}`, result.context[key], ref.ctx[key]);
  }
  same('context before answers', contextOf(bank, background), { ...result.context, tier: null, mgr: 0 });
  ref.steps.forEach((g, i) => {
    close(`detail ${i} threshold`, result.steps[i]?.threshold, g.thr);
    close(`detail ${i} multiplier`, result.steps[i]?.multiplier, g.mult);
  });
  for (const a of AREAS) {
    close(`raw ${a}`, result.sectors[a].raw, ref.raw[a]);
    close(`keep ${a}`, result.sectors[a].keep, ref.keep[a]);
    close(`price ${a}`, result.sectors[a].price, ref.idx[a]);
    close(`priceFullWeight ${a}`, result.sectors[a].priceFullWeight, ref.full[a]);
  }
  close('overall', result.overall, ref.overall);
  close('overallFullWeight', result.overallFullWeight, ref.overallFull);
  close('keepAll', result.keepAll, ref.keepAll);
  same('interestWrong', result.interestWrong, ref.wrong);
  same('flags', result.flags.map((f) => `${f.id}:${f.points}`), ref.flags);
  same('flagPoints', result.flagPoints, ref.pts);
  same('grade', result.grade, ref.grade);
  same('contrasts', result.contrasts, ref.con);
  same('mindAlert', result.mindAlert, ref.mindAlert);
  same('rank', result.rank, ref.rank);
  close('objectivePrice', result.socialPosition?.objectivePrice, ref.objIdx);
  same('objectiveRung', result.socialPosition?.objectiveRung, ref.objRung);
  same('ladder', result.socialPosition?.ladder, ref.ladder);
  close('gap', result.socialPosition?.gap, ref.gap);
  same('ladder rungs', result.socialPosition?.ladderRungs, [2 * ref.ladder + 1, 2 * ref.ladder + 2]);
  same('gap kind', result.socialPosition?.gapKind, ref.gap <= -2 ? 'below' : ref.gap >= 2 ? 'above' : 'close');
  same('reduced weight count', result.reducedWeight.count, ref.fastN);
  close('reduced weight points', result.reducedWeight.points, Math.abs(ref.overallFull - ref.overall));

  // What renderResult() printed: the market line, the sector tags and the type.
  const baseLang = (/<h3>Type<\/h3>|<h2>Sectors<\/h2>/.test(ref.html) ? 'en' : 'zh') as Lang;
  const L = TEXT[baseLang];
  const printed = parseHtml(ref.html);
  if (printed.talk === '' || Object.keys(printed.tags).length !== AREAS.length) add('could not read the market line or the sector table of the reference page');
  const kind = result.market.change?.kind;
  if (departsOnMovers(result)) {
    // The first sentence (leader and laggard) is still the page's. The second is not expected.
    s.moversDeparture = kind ?? null;
    same('market line, first sentence', talkFrom({ ...result, market: { ...result.market, change: null } }, baseLang), printed.talk.split(/(?<=[。.]) /)[0]);
  } else {
    // Every compared sector moved: these three kinds are the only ones allowed, and the line is the page's.
    if (kind !== undefined && !['all_up', 'all_down', 'mixed'].includes(kind)) add(`market change kind ${kind} although every sector moved`);
    same('market line', talkFrom(result, baseLang), printed.talk);
  }
  for (const a of AREAS) {
    const tag = result.market.tags[a];
    same(`tag ${a}`, tag === null ? '' : L.tag[tag], printed.tags[bank.areas[a].tick]);
  }
  same(
    'type',
    result.type === null ? null : L.type(bank.areas[result.type[0]][baseLang], bank.areas[result.type[1]][baseLang]),
    printed.type,
  );
}

interface PyArea {
  raw: number;
  full: number;
  keep: number;
  price: number;
  priceFull: number;
}

interface PyResult {
  error?: string;
  path: Array<[string, string]>;
  context: Record<string, string | number | null>;
  count: number;
  thresholds: number[];
  multipliers: number[];
  areas: Record<string, PyArea | null>;
}

function runPython(sessions: Session[]): PyResult[] | null {
  const driver = fileURLToPath(new URL('./differential/py_driver.py', import.meta.url));
  const reference = fileURLToPath(new URL('../../../reference/python', import.meta.url));
  const input = JSON.stringify(
    sessions.map((s) => ({
      role: s.role,
      background: s.background,
      ks: s.steps.map((x) => x.k),
      langs: s.steps.map((x) => x.lang),
      secs: s.steps.map((x) => x.secs),
    })),
  );
  const run = spawnSync('python3', ['-B', driver, reference], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (run.error || run.status !== 0) {
    console.warn(`python3 did not run, items2.py comparison skipped: ${run.error ?? run.stderr}`);
    return null;
  }
  return JSON.parse(run.stdout) as PyResult[];
}

function compareWithPython(s: Session, py: PyResult, problems: string[]): void {
  const add = (text: string): void => {
    problems.push(`session ${s.n} (${s.role}): ${text}`);
  };
  if (py.error) {
    add(`items2.py could not walk the path of the reference page: ${py.error}`);
    return;
  }
  const background: Background = { age: s.age, role: s.role, extra: s.background };
  const steps: Step[] = s.steps.map((g) => ({
    id: g.id,
    key: g.key,
    k: g.k,
    secs: g.secs,
    lang: g.lang,
    where: WHERE[g.where],
    source: 'questionnaire',
  }));
  const result = compute({ bank, background, steps });
  const path = result.steps.map((d) => [d.id, d.key]);
  if (JSON.stringify(path) !== JSON.stringify(py.path)) add(`path: engine ${JSON.stringify(path)}, items2 ${JSON.stringify(py.path)}`);
  if (result.counts.total !== py.count) add(`count: engine ${result.counts.total}, items2 ${py.count}`);
  for (const key of ['role', 'money', 'field', 'nowork', 'tier', 'mgr'] as const) {
    if (result.context[key] !== py.context[key]) add(`context ${key}: engine ${result.context[key]}, items2 ${py.context[key]}`);
  }
  result.steps.forEach((d, i) => {
    if (!near(d.threshold, py.thresholds[i])) add(`threshold ${i} ${d.id}: engine ${d.threshold}, items2 ${py.thresholds[i]}`);
    if (!near(d.multiplier, py.multipliers[i])) add(`multiplier ${i} ${d.id}: engine ${d.multiplier}, items2 ${py.multipliers[i]}`);
  });
  const clip = (x: number): number => Math.max(55, Math.min(145, x));
  for (const a of AREAS) {
    const sector = result.sectors[a];
    const p = py.areas[a];
    if (p === null) {
      if (sector.price !== null) add(`${a}: engine priced it, items2 did not`);
      continue;
    }
    // items2.score leaves the interest correction to the page; apply it the way the page does.
    const adjust = (x: number): number => (result.interestWrong && a === 'C' ? x + 0.1 * (0.5 - x) : x);
    const raw = adjust(p.raw);
    const full = adjust(p.full);
    if (!near(sector.keep, p.keep)) add(`keep ${a}: engine ${sector.keep}, items2 ${p.keep}`);
    if (!near(sector.raw, raw)) add(`raw ${a}: engine ${sector.raw}, items2 ${raw}`);
    // Where no correction applies, compare with the price items2.price itself returned.
    if (raw === p.raw && !near(sector.price, p.price)) add(`price ${a}: engine ${sector.price}, items2.price ${p.price}`);
    if (full === p.full && !near(sector.priceFullWeight, p.priceFull)) add(`priceFullWeight ${a}: engine ${sector.priceFullWeight}, items2.price ${p.priceFull}`);
    if (!near(sector.price, clip(100 + (15 * (raw - 0.5)) / 0.2))) add(`price ${a}: engine ${sector.price}, items2 ${p.price}`);
    if (!near(sector.priceFullWeight, clip(100 + (15 * (full - 0.5)) / 0.2))) {
      add(`priceFullWeight ${a}: engine ${sector.priceFullWeight}, items2 ${p.priceFull}`);
    }
  }
}

describe('differential fuzzing against the references', () => {
  const sessions = generate();

  it('walks at least 400 sessions over all 11 roles and both languages', () => {
    expect(sessions.length).toBeGreaterThanOrEqual(400);
    expect(new Set(sessions.map((s) => s.role)).size).toBe(11);
    expect(new Set(sessions.flatMap((s) => s.steps.map((x) => x.lang)))).toEqual(new Set(['zh', 'en']));
    expect(sessions.some((s) => s.steps.some((x) => x.secs === null))).toBe(true);
    expect(sessions.some((s) => s.steps.some((x) => x.secs !== null && x.secs < 0.1))).toBe(true);
  });

  it('the fuzz reaches every version, check, grade, contrast, tier and kind of market line', () => {
    const versions = new Set(sessions.flatMap((s) => s.steps.map((x) => `${x.id}:${x.key}`)));
    const allVersions = Object.entries(bank.items).flatMap(([id, item]) => item.versions.map((v) => `${id}:${v.key}`));
    const flags = new Set(sessions.flatMap((s) => s.ref.flags));
    const contrasts = new Set(sessions.flatMap((s) => s.ref.con));
    const talks = sessions.map((s) => parseHtml(s.ref.html).talk);
    const report = {
      sessions: sessions.length,
      versions: `${versions.size} of ${allVersions.length}`,
      flags: [...flags].sort(),
      contrasts: [...contrasts].sort(),
      grades: [...new Set(sessions.map((s) => s.ref.grade))].sort(),
      mindAlert: sessions.filter((s) => s.ref.mindAlert).length,
      tiers: [...new Set(sessions.map((s) => s.ref.ctx.tier))].sort(),
      managers: sessions.filter((s) => s.ref.ctx.mgr === 1).length,
      interestWrong: sessions.filter((s) => s.ref.wrong).length,
      reducedWeight: sessions.filter((s) => s.ref.fastN > 0).length,
      marketFlat: talks.filter((t) => /齐头并进|are level/.test(t)).length,
      marketLeaderOnly: talks.filter((t) => /龙头板块。|leading sector\./.test(t)).length,
      marketAllUp: talks.filter((t) => /全线上涨|Every sector is up/.test(t)).length,
      marketAllDown: talks.filter((t) => /全线下跌|Every sector is down/.test(t)).length,
      marketMixed: talks.filter((t) => /领跌|fell most \(.*\)\.$/.test(t) && /领涨|gained most .* and /.test(t)).length,
    };
    console.log('fuzz coverage', JSON.stringify(report));
    expect(allVersions.filter((v) => !versions.has(v))).toEqual([]);
    expect(report.flags).toEqual(['f10:1', 'f11:2', 'f12:1', 'f1:2', 'f2:1', 'f3:1', 'f4:2', 'f5:1', 'f6:2', 'f7:1', 'f8:2', 'f9:1']);
    expect(report.contrasts).toEqual(['c1a', 'c1b', 'c2a', 'c2b', 'c3a', 'c3b', 'c4a', 'c4b', 'c6a', 'c6b']);
    expect(report.grades).toEqual(['A', 'B', 'C']);
    expect(report.tiers).toEqual(['high', 'low', 'mid', 'sup']);
    for (const count of [report.mindAlert, report.managers, report.marketFlat, report.marketLeaderOnly, report.marketAllUp, report.marketAllDown, report.marketMixed]) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it('the comparison itself notices a changed reference value', () => {
    const tampered = (change: (s: Session) => void): number => {
      const copy = JSON.parse(JSON.stringify(sessions.find((x) => x.previous !== null && !x.looseWhere))) as Session;
      copy.problems = [];
      change(copy);
      compareWithPage(copy);
      return copy.problems.length;
    };
    expect(tampered(() => undefined)).toBe(0);
    expect(tampered((s) => (s.ref.raw.W = (s.ref.raw.W as number) + 1e-8))).toBe(1);
    expect(tampered((s) => (s.ref.idx.M = (s.ref.idx.M as number) - 1e-8))).toBe(1);
    expect(tampered((s) => (s.ref.steps[4].thr += 1e-8))).toBeGreaterThan(0);
    expect(tampered((s) => (s.ref.steps[4].mult -= 1e-8))).toBeGreaterThan(0);
    expect(tampered((s) => s.ref.flags.push('f9:1'))).toBe(1);
    expect(tampered((s) => s.ref.con.push('c6a'))).toBe(1);
    expect(tampered((s) => (s.ref.mindAlert = !s.ref.mindAlert))).toBe(1);
    expect(tampered((s) => s.ref.rank.reverse())).toBe(1);
    expect(tampered((s) => (s.ref.objRung += 1))).toBeGreaterThan(0);
    expect(tampered((s) => (s.ref.ctx.tier = 'none'))).toBe(1);
    expect(tampered((s) => (s.ref.html = s.ref.html.replace('<div class="talk">', '<div class="talk">X')))).toBe(1);
    expect(tampered((s) => (s.steps[2].key = 'nope'))).toBeGreaterThan(0);
    expect(tampered((s) => s.steps[2].order.reverse())).toBeGreaterThan(0);
  });

  it('the TypeScript engine agrees with reference/test_page.html on every session', () => {
    for (const s of sessions) compareWithPage(s);
    const failed = sessions.filter((s) => s.problems.length > 0);
    const report = failed.slice(0, 5).map((s) => ({ problems: s.problems.slice(0, 12), input: describeInput(s) }));
    if (failed.length > 0) console.log(`sessions with a difference: ${failed.length} of ${sessions.length}`);
    expect(report).toEqual([]);
    // The deliberate departure on movers is exercised: an identical previous record gives
    // "unchanged" where the page prints "every sector is up, ... (+0.00)".
    const departures = sessions.filter((s) => s.moversDeparture);
    expect(departures.length).toBeGreaterThan(0);
    expect(departures.some((s) => s.moversDeparture === 'unchanged')).toBe(true);
  });

  it('the TypeScript engine agrees with reference/python/items2.py on every session', (ctx) => {
    const results = runPython(sessions);
    if (results === null) {
      ctx.skip();
      return;
    }
    expect(results).toHaveLength(sessions.length);
    const problems: string[] = [];
    sessions.forEach((s, i) => compareWithPython(s, results[i], problems));
    // The comparison notices a changed value.
    const probe: string[] = [];
    const changed = JSON.parse(JSON.stringify(results[0])) as PyResult;
    (changed.areas.N as PyArea).raw += 1e-8;
    changed.thresholds[0] += 1e-8;
    compareWithPython(sessions[0], changed, probe);
    expect(probe.length).toBeGreaterThanOrEqual(3);
    console.log(`items2.py comparison: ${results.length} sessions, ${problems.length} differences`);
    expect(problems.slice(0, 20)).toEqual([]);
  });
});
