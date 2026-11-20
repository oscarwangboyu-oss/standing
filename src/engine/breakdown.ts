// "Why it moved": every rise or fall of a price broken down to the points each answer added.
//
// Method, for two inputs to compute (before and after):
// 1. Find what changed: every question whose effective answer differs (another option, a
//    different weight from the answer time, another wording, asked in one and not in the
//    other), every extra item that differs, and the algorithm or norm version.
// 2. For each change on its own, take the after input, put that one thing back to what it was
//    before, and recompute. The after price minus that price is what the change contributed.
// 3. Changes interact a little, so the contributions do not add up exactly. They are scaled
//    by one factor per price so that they do. When the factor would be outside (0, maxScale]
//    (see BREAKDOWN in config.ts), or when the two inputs differ in more than answers
//    (another background, other sectors left out, another bank), the contributions are left
//    as measured and the rest is listed as one line of kind "other".
// Either way the lines of a price add up to its change (to rounding of floating point, far
// below 1e-9). The answer, extra and version lines come largest first; the line "other" is
// always last, since it is no single reason.
//
// The result carries the situation and the age band of each side, and nothing else of the
// background, so a screen can say why a line "other" is there when they differ.
//
// Answers that were overridden by a micro app are compared as they were scored: the line
// carries the source of the answer in force.

import { BREAKDOWN } from './config';
import { compute } from './score';
import { AREA_IDS } from './types';
import type { AreaId, Background, ComputeInput, Extra, Override, Result, RoleId, Source, Step, StepDetail } from './types';

/** An answer as it was scored. */
export interface AnswerState {
  /** Version key shown. */
  key: string;
  /** Option used for scoring, after overrides. null when skipped. */
  k: number | null;
  /** Weight multiplier used for scoring. */
  weight: number;
  source: Source;
}

export interface BreakdownLine {
  /**
   * answer: a question of the bank. extra: an item from a micro app that is not in the bank.
   * version: the algorithm or the norms changed. other: the part no single change accounts for.
   */
  kind: 'answer' | 'extra' | 'version' | 'other';
  /** Question id or extra id. null for version and other. */
  id: string | null;
  /** Source of the answer or item now in force, or of the one that went away. null for version and other. */
  source: Source | null;
  /** The answer before. null when it was not asked then, and for every kind but answer. */
  before: AnswerState | null;
  /** The answer after. null when it is not asked now, and for every kind but answer. */
  after: AnswerState | null;
  /** Price points this change added (negative: took away). */
  points: number;
}

export interface PriceBreakdown {
  before: number | null;
  after: number | null;
  /** after minus before. null when either has no price; there are no lines then. */
  delta: number | null;
  /** The lines add up to delta. Lines of exactly 0 points are left out. */
  lines: BreakdownLine[];
  /** scaled: contributions times one factor. remainder: contributions as measured plus a line "other". none: nothing to explain. */
  method: 'scaled' | 'remainder' | 'none';
}

/** The part of a background a breakdown carries: the situation and the age band. No answers. */
export interface BreakdownCohort {
  role: RoleId;
  /** Index into bank.ages. */
  age: number;
}

export interface Breakdown {
  sectors: Record<AreaId, PriceBreakdown>;
  overall: PriceBreakdown;
  /** How many questions and extra items changed between the two inputs. */
  changed: number;
  /**
   * The situation and age band of each input. When they differ, the contributions are left as
   * measured and the rest of a move is a line "other" (see the top of this file).
   */
  cohorts: { before: BreakdownCohort; after: BreakdownCohort };
}

const cohortOf = (background: Background): BreakdownCohort => ({ role: background.role, age: background.age });

/** Answer, extra and version lines largest first, so the top line is the main reason. The line "other" last. */
function byWeight(x: BreakdownLine, y: BreakdownLine): number {
  const rest = Number(x.kind === 'other') - Number(y.kind === 'other');
  return rest !== 0 ? rest : Math.abs(y.points) - Math.abs(x.points);
}

type Quantity = AreaId | 'overall';
const QUANTITIES: Quantity[] = [...AREA_IDS, 'overall'];

function priceOf(result: Result, q: Quantity): number | null {
  return q === 'overall' ? result.overall : result.sectors[q].price;
}

function stateOf(detail: StepDetail | undefined): AnswerState | null {
  return detail ? { key: detail.key, k: detail.k, weight: detail.multiplier, source: detail.source } : null;
}

function sameAnswer(x: AnswerState | null, y: AnswerState | null): boolean {
  if (x === null || y === null) return x === y;
  return x.key === y.key && x.k === y.k && Math.abs(x.weight - y.weight) <= 1e-12;
}

function sameExtra(x: Extra | undefined, y: Extra | undefined): boolean {
  if (!x || !y) return x === y;
  if (x.area !== y.area || x.score !== y.score) return false;
  return AREA_IDS.every((a) => (x.load[a] ?? 0) === (y.load[a] ?? 0));
}

function sameList(x: readonly string[] | undefined, y: readonly string[] | undefined): boolean {
  const a = [...(x ?? [])].sort();
  const b = [...(y ?? [])].sort();
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

interface Change {
  line: Omit<BreakdownLine, 'points'>;
  /** The after input with this one change put back. */
  reverted: ComputeInput;
}

/**
 * Breaks the change of every sector price and of the overall price between two inputs down
 * into lines. See the top of this file for the method.
 */
export function breakdown(before: ComputeInput, after: ComputeInput): Breakdown {
  const resultBefore = compute(before);
  const resultAfter = compute(after);
  const sameBank = resultBefore.versions.bank === resultAfter.versions.bank;
  const structural =
    !sameBank ||
    before.background.role !== after.background.role ||
    before.background.age !== after.background.age ||
    JSON.stringify(Object.entries(before.background.extra).sort()) !== JSON.stringify(Object.entries(after.background.extra).sort()) ||
    !sameList(before.excludedAreas, after.excludedAreas);

  const changes: Change[] = [];
  if (sameBank) {
    // ---- questions
    const detailBefore = new Map(resultBefore.steps.map((s) => [s.id, s]));
    const detailAfter = new Map(resultAfter.steps.map((s) => [s.id, s]));
    const ids = [...detailAfter.keys(), ...[...detailBefore.keys()].filter((id) => !detailAfter.has(id))];
    for (const id of ids) {
      const was = stateOf(detailBefore.get(id));
      const now = stateOf(detailAfter.get(id));
      if (sameAnswer(was, now)) continue;
      // replay reads the first step of a question; overrides read the last one.
      const oldStep: Step | undefined = before.steps.find((s) => s.id === id);
      const oldOverride: Override | undefined = [...(before.overrides ?? [])].reverse().find((o) => o.itemId === id);
      changes.push({
        line: { kind: 'answer', id, source: (now ?? was)?.source ?? null, before: was, after: now },
        reverted: {
          ...after,
          steps: [...after.steps.filter((s) => s.id !== id), ...(was && oldStep ? [oldStep] : [])],
          overrides: [...(after.overrides ?? []).filter((o) => o.itemId !== id), ...(was && oldOverride ? [oldOverride] : [])],
        },
      });
    }
    // ---- extra items
    const extraBefore = new Map((before.extras ?? []).map((e) => [e.id, e]));
    const extraAfter = new Map((after.extras ?? []).map((e) => [e.id, e]));
    const extraIds = [...extraAfter.keys(), ...[...extraBefore.keys()].filter((id) => !extraAfter.has(id))];
    for (const id of extraIds) {
      const was = extraBefore.get(id);
      const now = extraAfter.get(id);
      if (sameExtra(was, now)) continue;
      changes.push({
        line: { kind: 'extra', id, source: (now ?? was)?.source ?? null, before: null, after: null },
        reverted: { ...after, extras: [...(after.extras ?? []).filter((e) => e.id !== id), ...(was ? [was] : [])] },
      });
    }
    // ---- algorithm or norm version
    const vb = resultBefore.versions;
    const va = resultAfter.versions;
    if (vb.algo !== va.algo || vb.norm !== va.norm) {
      changes.push({
        line: { kind: 'version', id: null, source: null, before: null, after: null },
        reverted: { ...after, versions: { algo: vb.algo, bank: va.bank, norm: vb.norm } },
      });
    }
  }
  const reverted = changes.map((c) => compute(c.reverted));

  const explain = (q: Quantity): PriceBreakdown => {
    const from = priceOf(resultBefore, q);
    const to = priceOf(resultAfter, q);
    if (from === null || to === null) return { before: from, after: to, delta: null, lines: [], method: 'none' };
    const delta = to - from;
    // A change whose reverted input has no price for this quantity cannot be measured here.
    const raw = reverted.map((r) => {
      const without = priceOf(r, q);
      return without === null ? 0 : to - without;
    });
    const sum = raw.reduce((total, x) => total + x, 0);
    const scale = sum === 0 ? Number.NaN : delta / sum;
    const scaled = !structural && scale > 0 && scale <= BREAKDOWN.maxScale;
    const lines: BreakdownLine[] = [];
    let listed = 0;
    raw.forEach((x, i) => {
      const points = scaled ? x * scale : x;
      if (points === 0) return;
      lines.push({ ...changes[i].line, points });
      listed += points;
    });
    if (!scaled) {
      const rest = delta - listed;
      if (rest !== 0) lines.push({ kind: 'other', id: null, source: null, before: null, after: null, points: rest });
    }
    lines.sort(byWeight);
    return { before: from, after: to, delta, lines, method: lines.length === 0 ? 'none' : scaled ? 'scaled' : 'remainder' };
  };

  const sectors = {} as Record<AreaId, PriceBreakdown>;
  for (const a of AREA_IDS) sectors[a] = explain(a);
  return {
    sectors,
    overall: explain('overall'),
    changed: changes.filter((c) => c.line.kind !== 'version').length,
    cohorts: { before: cohortOf(before.background), after: cohortOf(after.background) },
  };
}
