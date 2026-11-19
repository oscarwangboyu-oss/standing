// Question selection, as pure functions of (bank, background, steps so far).
// A session can stop at any point and resume from its stored steps.

import { AREA_IDS, EngineError } from '../../types';
import type {
  AreaId,
  Background,
  Bank,
  BankItem,
  CompSlot,
  Context,
  ContextKey,
  ItemVersion,
  NextQuestion,
  Progress,
  SectionId,
  Step,
  TierId,
} from '../../types';
import type { AlgoParamsV1 } from './params';

export function itemOf(bank: Bank, id: string): BankItem {
  if (!Object.hasOwn(bank.items, id)) throw new EngineError(`unknown question "${id}" in bank ${bank.bank_version}`);
  return bank.items[id];
}

export function versionOf(item: BankItem, id: string, key: string): ItemVersion {
  const version = item.versions.find((v) => v.key === key);
  if (!version) throw new EngineError(`question "${id}" has no version "${key}"`);
  return version;
}

export function checkOption(version: ItemVersion, id: string, k: number): void {
  if (!Number.isInteger(k) || k < 0 || k >= version.opts.length) {
    throw new EngineError(`question "${id}" version "${version.key}" has no option ${k}`);
  }
}

/**
 * Routing attributes from the background answers. tier and mgr are filled in while answering.
 * Every background question of the role needs an answer in range, as on the reference page,
 * which cannot start without them. A missing one would quietly switch off what reads it
 * (check f12 reads `stage` and `exp`).
 */
export function contextOf(bank: Bank, background: Background): Context {
  if (!Object.hasOwn(bank.extra, background.role)) throw new EngineError(`unknown role "${background.role}"`);
  const questions = bank.extra[background.role];
  for (const question of questions) {
    const k = background.extra?.[question.id];
    if (!Number.isInteger(k) || k < 0 || k >= question.opts.length) {
      throw new EngineError(`background answer "${question.id}" is missing or out of range`);
    }
  }
  // Option index of a background question, or null when this role is not asked it.
  const answer = (id: string): number | null => (questions.some((q) => q.id === id) ? background.extra[id] : null);
  const money = answer('money');
  const field = answer('field');
  const exp = answer('exp');
  return {
    role: background.role,
    money: money === null ? 'own' : bank.moneyIds[money],
    field: field === null ? null : bank.fieldIds[field],
    nowork: exp === 0 ? 1 : 0,
    tier: null,
    mgr: 0,
  };
}

/** The question a slot stands for in this context, or null when the slot is left out. */
function resolveSlot(slot: CompSlot, ctx: Context): string | null {
  if (typeof slot === 'string') return slot;
  if (slot[0] === 'skip') return ctx[slot[1]] === slot[2] ? null : slot[3];
  return ctx[slot[1]] === slot[2] ? slot[3] : slot[4];
}

/** The first version whose conditions all hold. */
export function pickVersion(bank: Bank, id: string, ctx: Context): ItemVersion {
  for (const version of itemOf(bank, id).versions) {
    const fits = Object.entries(version.when).every(
      ([key, allowed]) => allowed !== undefined && allowed.includes(ctx[key as ContextKey]),
    );
    if (fits) return version;
  }
  throw new EngineError(`no version of "${id}" fits role ${ctx.role}, money ${ctx.money}, tier ${ctx.tier}`);
}

function defaultTier(params: AlgoParamsV1, ctx: Context): TierId {
  return ctx.money === 'sup' ? params.skipDefaults.tierWhenMoneyIsSup : params.skipDefaults.tier;
}

/** Writes tier and mgr to the context after an answer. A skipped routing question uses the defaults. */
function route(params: AlgoParamsV1, version: ItemVersion, k: number | null, ctx: Context): void {
  if (version.tier) ctx.tier = k === null ? defaultTier(params, ctx) : version.tier[k];
  if (version.mgr) ctx.mgr = k === null ? params.skipDefaults.mgr : version.mgr[k];
}

/** A routing question that is never asked (its sector is excluded) leaves the defaults behind. */
function routeUnasked(params: AlgoParamsV1, item: BankItem, ctx: Context): void {
  if (item.versions.some((v) => v.tier)) ctx.tier = defaultTier(params, ctx);
  if (item.versions.some((v) => v.mgr)) ctx.mgr = params.skipDefaults.mgr;
}

export interface PathEntry {
  id: string;
  item: BankItem;
  /** null when the question has not been reached yet. */
  step: Step | null;
  /** The version that was shown. null when the question has not been reached yet. */
  version: ItemVersion | null;
}

export interface Replay {
  /** Context after every stored step. */
  context: Context;
  /** The questions this person is asked, in order. Questions of excluded sectors are not on the path. */
  path: PathEntry[];
  /** Index in path of the first question without a step, or -1 when all are done. */
  openIndex: number;
  /** Context at the moment the first open question is reached. */
  openContext: Context | null;
}

/**
 * Walks the questionnaire of the role and lines the stored steps up with it.
 * Every step is validated. Steps for questions that are not on this person's path are ignored.
 * When a question id appears twice, the first step counts.
 */
export function replay(
  params: AlgoParamsV1,
  bank: Bank,
  background: Background,
  steps: readonly Step[],
  excludedAreas?: readonly AreaId[],
): Replay {
  const ctx = contextOf(bank, background);
  for (const area of excludedAreas ?? []) {
    if (!AREA_IDS.includes(area)) throw new EngineError(`cannot exclude unknown sector "${area}"`);
  }
  const excluded = new Set<SectionId>(excludedAreas ?? []);

  const byId = new Map<string, Step>();
  for (const step of steps) {
    const version = versionOf(itemOf(bank, step.id), step.id, step.key);
    if (step.k !== null) checkOption(version, step.id, step.k);
    if (step.lang !== 'zh' && step.lang !== 'en') throw new EngineError(`step "${step.id}" has no language`);
    if (step.secs !== null && !Number.isFinite(step.secs)) throw new EngineError(`step "${step.id}" has an invalid time`);
    if (!byId.has(step.id)) byId.set(step.id, step);
  }

  const path: PathEntry[] = [];
  let openIndex = -1;
  let openContext: Context | null = null;
  for (const slot of bank.comp[ctx.role]) {
    const id = resolveSlot(slot, ctx);
    if (id === null) continue;
    const item = itemOf(bank, id);
    if (excluded.has(item.area)) {
      routeUnasked(params, item, ctx);
      continue;
    }
    const step = byId.get(id) ?? null;
    let version: ItemVersion | null = null;
    if (step) {
      version = versionOf(item, id, step.key);
      route(params, version, step.k, ctx);
    } else if (openIndex < 0) {
      openIndex = path.length;
      openContext = { ...ctx };
    }
    path.push({ id, item, step, version });
  }
  return { context: ctx, path, openIndex, openContext };
}

/** The next question to show, or null when the questionnaire is finished. */
export function nextQuestion(
  params: AlgoParamsV1,
  bank: Bank,
  background: Background,
  steps: readonly Step[],
  excludedAreas?: readonly AreaId[],
): NextQuestion | null {
  const { path, openIndex, openContext } = replay(params, bank, background, steps, excludedAreas);
  if (openIndex < 0 || openContext === null) return null;
  const entry = path[openIndex];
  const version = pickVersion(bank, entry.id, openContext);
  return { id: entry.id, key: version.key, version, section: entry.item.area, index: openIndex, total: path.length };
}

/** Counts for the progress bar. */
export function progressOf(
  params: AlgoParamsV1,
  bank: Bank,
  background: Background,
  steps: readonly Step[],
  excludedAreas?: readonly AreaId[],
): Progress {
  const { path } = replay(params, bank, background, steps, excludedAreas);
  const asked = path.filter((entry) => entry.step !== null).length;
  return { asked, total: path.length, remaining: path.length - asked };
}
