// Shared helpers for the engine tests.

import { BANKS, CURRENT, compute, contextOf, nextQuestion } from '../../../src/engine';
import type {
  AreaId,
  Background,
  Bank,
  Context,
  ItemVersion,
  Lang,
  MoneyId,
  NextQuestion,
  RoleId,
  SelectionOptions,
  Step,
} from '../../../src/engine';
import { pickVersion } from '../../../src/engine/algo/v1/selection';

export const bank: Bank = BANKS[CURRENT.bank];
export const AREAS: AreaId[] = ['C', 'W', 'N', 'B', 'M'];
export const TOLERANCE = 1e-9;

export function near(actual: number | null | undefined, expected: number | null | undefined): boolean {
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    return actual === expected;
  }
  return Math.abs(actual - expected) <= TOLERANCE;
}

/** Option index, or null to skip the question. */
export type Chooser = (question: NextQuestion, stepsSoFar: Step[]) => number | null;

export interface WalkOptions extends SelectionOptions {
  lang?: Lang;
  secs?: number | null;
}

/** Answers the whole questionnaire through the public API, one question at a time. */
export function walk(background: Background, choose: Chooser, opts: WalkOptions = {}): Step[] {
  return walkOn(bank, background, choose, opts);
}

/** walk() on any bank, for example a copy with a planted problem. */
export function walkOn(b: Bank, background: Background, choose: Chooser, opts: WalkOptions = {}): Step[] {
  const steps: Step[] = [];
  for (;;) {
    const question = nextQuestion(b, background, steps, opts);
    if (question === null) return steps;
    if (steps.length > 60) throw new Error('questionnaire does not end');
    steps.push({
      id: question.id,
      key: question.key,
      k: choose(question, steps),
      secs: opts.secs ?? null,
      lang: opts.lang ?? 'zh',
      source: 'questionnaire',
    });
  }
}

/** Index of the option with the highest score. Not always the last option. */
export function bestOption(version: ItemVersion): number {
  let best = -1;
  version.s.forEach((s, k) => {
    if (s !== null && (best < 0 || s > (version.s[best] as number))) best = k;
  });
  return best;
}

/** Index of the option with the lowest score. */
export function worstOption(version: ItemVersion): number {
  let worst = -1;
  version.s.forEach((s, k) => {
    if (s !== null && (worst < 0 || s < (version.s[worst] as number))) worst = k;
  });
  return worst;
}

export const chooseBest: Chooser = (q) => bestOption(q.version);
export const chooseWorst: Chooser = (q) => worstOption(q.version);
export const chooseFirst: Chooser = () => 0;
export const skipAll: Chooser = () => null;

export interface Situation {
  background: Background;
  money: MoneyId;
  field: string | null;
  nowork: 0 | 1;
}

/**
 * Every situation the reference audit walks (contexts() of items2.py): each role, each source
 * of day-to-day money the role is asked about, each field, and for job seekers with and
 * without work experience. Defaults to the current bank.
 */
export function situations(b: Bank = bank): Situation[] {
  const out: Situation[] = [];
  for (const role of b.roles) {
    const ids = b.extra[role.id].map((q) => q.id);
    const moneys: MoneyId[] = ids.includes('money') ? ['own', 'sup', 'hh'] : ['own'];
    const fields: Array<string | null> = ids.includes('field') ? b.fieldIds : [null];
    const noworks: Array<0 | 1> = ids.includes('exp') ? [0, 1] : [0];
    for (const money of moneys) {
      for (const field of fields) {
        for (const nowork of noworks) {
          const extra: Record<string, number> = {};
          for (const id of ids) {
            if (id === 'money') extra.money = b.moneyIds.indexOf(money);
            else if (id === 'field') extra.field = b.fieldIds.indexOf(field as (typeof b.fieldIds)[number]);
            else if (id === 'exp') extra.exp = nowork === 1 ? 0 : 2;
            else extra[id] = 1;
          }
          out.push({ background: { age: 2, role: role.id, extra }, money, field, nowork });
        }
      }
    }
  }
  return out;
}

/** A plain background for a role: 25 to 29, own earnings, first field, some experience. */
export function backgroundFor(role: RoleId, overrides: Record<string, number> = {}, age = 2): Background {
  const extra: Record<string, number> = {};
  for (const q of bank.extra[role]) {
    extra[q.id] = q.id === 'exp' ? 2 : q.id === 'stage' ? 2 : 0;
  }
  return { age, role, extra: { ...extra, ...overrides } };
}

/** Replaces the answer of one question in a list of steps. */
export function withAnswer(steps: readonly Step[], id: string, k: number | null): Step[] {
  if (!steps.some((s) => s.id === id)) throw new Error(`no step for ${id}`);
  return steps.map((s) => (s.id === id ? { ...s, k } : s));
}

// ---------------------------------------------------------------- audit() of items2.py

const STUDENT_ROLES: RoleId[] = ['ug4', 'cc', 'grad'];

/**
 * count(ctx) of items2.py: the slots of the role, minus the skip slots whose condition holds
 * in the FINAL context. It is computed from the bank alone, not by the engine, so it catches
 * a skip slot that depends on an answer given later in the sequence.
 */
export function referenceCount(b: Bank, finalContext: Context): number {
  return b.comp[finalContext.role].filter(
    (slot) => !(Array.isArray(slot) && slot[0] === 'skip' && finalContext[slot[1]] === slot[2]),
  ).length;
}

export interface AuditReport {
  situations: number;
  /** Walks done: every situation with every income answer, twice for employees and gig workers. */
  walks: number;
  /** Distinct questionnaires (question and version sequences). */
  questionnaires: number;
  /** One line per problem: "role/money/field/nwN W1=k lvl=l: kind". */
  problems: string[];
  /** The distinct kinds of problem, sorted. */
  kinds: string[];
}

/**
 * audit() of reference/python/items2.py, rule for rule, on any bank: the shipped one, another
 * registered version, or a copy with a planted problem.
 */
export function auditBank(b: Bank): AuditReport {
  const problems: string[] = [];
  const paths = new Set<string>();
  const all = situations(b);
  const has = (keys: Record<string, string>, ids: string[]): boolean => ids.some((id) => id in keys);
  let walks = 0;

  for (const { background, money, field, nowork } of all) {
    const start = contextOf(b, background);
    const role = background.role;
    const w1 = pickVersion(b, 'W1', start);
    const levels = role === 'emp' || role === 'gig' ? [0, 4] : [0];

    for (let k1 = 0; k1 < w1.opts.length; k1++) {
      for (const level of levels) {
        walks++;
        const steps = walkOn(b, background, (q) => (q.id === 'W1' ? k1 : q.id === 'C_lvl' ? level : 0));
        const result = compute({ bank: b, background, steps });
        const keys: Record<string, string> = {};
        for (const s of steps) keys[s.id] = s.key;
        paths.add(JSON.stringify(Object.entries(keys)));

        const tag = `${role}/${money}/${field}/nw${nowork} W1=${k1} lvl=${level}`;
        const high = result.context.tier === 'high';
        const student = STUDENT_ROLES.includes(role);
        const bad: string[] = [];

        if (steps.length !== referenceCount(b, result.context) || Object.keys(keys).length !== steps.length) bad.push('count');
        if (
          student &&
          (keys.N1 !== 'stu' ||
            keys.N3 !== 'stu' ||
            !['stu', 'grad'].includes(keys.C_mast) ||
            has(keys, ['C_lvl', 'C_lic', 'C_deg', 'C_last']) ||
            keys.W4 !== 'stu')
        ) {
          bad.push('student');
        }
        const retireeIds = ['N3', 'N5', money === 'own' ? 'W1' : 'N5', 'W3', 'W5', 'W6', 'C_mast', 'C_last', 'C_learn', 'C_paid'];
        if (role === 'ret' && !retireeIds.every((id) => keys[id] === 'ret')) bad.push('retiree');
        if (role === 'ret' && 'C_lic' in keys) bad.push('retiree licence');
        if ((role === 'care' || role === 'oth') && has(keys, ['N5', 'C_mast', 'C_lic'])) bad.push('carer');
        if (role === 'owner' && has(keys, ['C_deg', 'C_rec', 'C_lic'])) bad.push('owner credential');
        if (role !== 'ret' && high && (!['save', 'loans'].includes(keys.W5) || keys.W2 !== '10000' || keys.W6 !== 'high')) {
          bad.push('high tier');
        }
        if (!student && keys.W5 === 'loans') bad.push('loans');
        if (!student && keys.N1 === 'stu') bad.push('student N1');
        if (nowork && has(keys, ['C_last', 'C_mast'])) bad.push('no work');
        for (const s of steps) {
          const v = b.items[s.id].versions.find((x) => x.key === s.key)!;
          const complete = v.s.length === v.opts.length && v.q.zh && v.q.en && v.opts.every((o) => o.zh && o.en);
          if (!complete) bad.push('incomplete');
          const values = v.s.filter((x): x is number => x !== null);
          // items2.py raises on min([]): a version without a scored option cannot pass.
          if (values.length === 0) bad.push('no scored option');
          else if (Math.min(...values) < 0 || Math.max(...values) > 1 + 1e-9) bad.push('score out of range');
        }
        for (const kind of new Set(bad)) problems.push(`${tag}: ${kind}`);
      }
    }
  }
  const kinds = [...new Set(problems.map((p) => p.slice(p.lastIndexOf(': ') + 2)))].sort();
  return { situations: all.length, walks, questionnaires: paths.size, problems, kinds };
}
