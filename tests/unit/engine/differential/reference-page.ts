// Harness of differential.test.ts: runs the <script> of reference/test_page.html inside node:vm with a minimal
// DOM and localStorage stub, so its begin(), record(), compute(), flags() and renderResult()
// can be driven from a test and compared with the TypeScript engine. Read-only use of the
// reference: nothing is written back.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export interface RefCurrent {
  id: string;
  key: string;
  options: number;
  total: number;
  asked: number;
}

export interface RefStep {
  id: string;
  key: string;
  k: number;
  secs: number | null;
  thr: number;
  mult: number;
  where: string;
}

export interface RefResult {
  ctx: Record<string, string | number | null>;
  total: number;
  steps: RefStep[];
  raw: Record<string, number | null>;
  keep: Record<string, number | null>;
  idx: Record<string, number | null>;
  full: Record<string, number | null>;
  overall: number;
  overallFull: number;
  keepAll: number;
  wrong: boolean;
  flags: string[];
  pts: number;
  grade: string;
  rank: string[];
  objIdx: number;
  objRung: number;
  ladder: number;
  gap: number;
  con: string[];
  mindAlert: boolean;
  fastN: number;
  /** innerHTML of the result view after renderResult(). */
  html: string;
}

export interface SavedRecord {
  label: string;
  ts: string;
  role: string;
  idx: Record<string, number | null>;
  raw: Record<string, number | null>;
  overall: number;
  grade: string;
}

export interface ReferencePage {
  begin(lang: string, age: number, role: string, background: Record<string, number>): void;
  current(): RefCurrent | null;
  /** The display order the page would use for the current question and this random number. */
  displayOrder(rngFloat: number): number[];
  setLang(lang: string): void;
  record(k: number, secs: number | null, where: string): void;
  /** Runs compute() and renderResult(). `previous` is put in the page's saved results first. */
  finish(previous: SavedRecord | null): RefResult;
}

const PAGE = fileURLToPath(new URL('../../../../reference/test_page.html', import.meta.url));

const DRIVER = `
function __begin(l, age, roleId, background) {
  lang = l;
  prof = { age: age, role: DATA.roles.findIndex(r => r.id === roleId), x: JSON.parse(background) };
  label = ""; randomFilled = false; refMode = "prov"; savedTs = null;
  begin();
}
function __current() {
  return cur ? JSON.stringify({ id: cur.id, key: cur.v.key, options: cur.v.opts.length, total: total, asked: ans.length }) : "null";
}
function __displayOrder(r) {
  const keep = Math.random;
  Math.random = () => r;
  try { return JSON.stringify(displayOrder(cur.v)); } finally { Math.random = keep; }
}
function __setLang(l) { lang = l; }
function __record(k, secs, where) { record(k, secs, where); }
function __finish(previous) {
  __storage = {};
  label = "";
  if (previous) { label = JSON.parse(previous).label; __storage[KEY] = "[" + previous + "]"; }
  renderResult();
  const o = window.__last;
  return JSON.stringify({
    ctx: ctx, total: total,
    steps: ans.map(x => ({ id: x.id, key: x.v.key, k: x.k, secs: x.secs, thr: x.thr, mult: x.mult, where: x.where })),
    raw: o.raw, keep: o.keep, idx: o.idx, full: o.full, overall: o.overall, overallFull: o.overallFull,
    keepAll: o.keepAll, wrong: o.wrong, flags: o.fl.list.map(f => f.id + ":" + f.p), pts: o.fl.pts, grade: o.fl.grade,
    rank: o.rank, objIdx: o.objIdx, objRung: o.objRung, ladder: o.ladder, gap: o.gap, con: o.con, mindAlert: o.mindAlert,
    fastN: ans.filter(x => x.mult < 1).length,
    html: document.getElementById("result").innerHTML
  });
}
`;

const STUBS = `
var __storage = {};
var __elements = {};
function __element() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, style: {}, dataset: {},
    classList: { add() {}, remove() {} },
    querySelectorAll() { return []; },
    setAttribute() {}, click() {}, focus() {}
  };
}
var document = {
  title: "",
  documentElement: { lang: "" },
  body: __element(),
  getElementById(id) { return __elements[id] || (__elements[id] = __element()); },
  createElement() { return __element(); }
};
var window = { scrollTo() {}, onerror: null };
var location = { hash: "" };
var localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(__storage, k) ? __storage[k] : null; },
  setItem(k, v) { __storage[k] = String(v); }
};
function setTimeout() {}
function confirm() { return false; }
`;

/** Loads the reference page. Throws when the page has no single inline script. */
export function loadReferencePage(): ReferencePage {
  const html = readFileSync(PAGE, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`expected one inline script in the reference page, found ${scripts.length}`);
  const context = vm.createContext({});
  vm.runInContext(STUBS, context, { filename: 'stubs.js' });
  vm.runInContext(scripts[0][1], context, { filename: 'test_page.html.js' });
  vm.runInContext(DRIVER, context, { filename: 'driver.js' });
  const call = (expr: string): string => String(vm.runInContext(expr, context));
  const arg = (value: unknown): string => JSON.stringify(value);
  return {
    begin(lang, age, role, background) {
      call(`__begin(${arg(lang)}, ${arg(age)}, ${arg(role)}, ${arg(JSON.stringify(background))})`);
    },
    current() {
      return JSON.parse(call('__current()')) as RefCurrent | null;
    },
    displayOrder(rngFloat) {
      return JSON.parse(call(`__displayOrder(${arg(rngFloat)})`)) as number[];
    },
    setLang(lang) {
      call(`__setLang(${arg(lang)})`);
    },
    record(k, secs, where) {
      call(`__record(${arg(k)}, ${arg(secs)}, ${arg(where)})`);
    },
    finish(previous) {
      return JSON.parse(call(`__finish(${previous ? arg(JSON.stringify(previous)) : 'null'})`)) as RefResult;
    },
  };
}
