// compute: from stored steps to a full result. Follows `compute` of reference/test_page.html,
// plus the rules the reference does not have: skipped questions, sectors without consent,
// overrides and extras.
//
// Which answers each part reads:
// - Prices, the interest correction, contrasts, the mind notice and social position read the
//   effective answers (after overrides, with extras).
// - Consistency checks, keepAll and the data grade read the questionnaire answers as given.
//
// The questions and options the rules read by name are listed in rules.ts.

import { AREA_IDS, EngineError, SOURCES } from '../../types';
import type {
  AlgoComputeInput,
  AreaId,
  ContrastId,
  ExtraDetail,
  ItemVersion,
  Override,
  Result,
  SectorNorm,
  SectorResult,
  SocialPosition,
  Source,
  Step,
  StepDetail,
} from '../../types';
import { bestScore, flagsOf } from './flags';
import { marketOf, rankOf } from './market';
import type { AlgoParamsV1 } from './params';
import { RULES } from './rules';
import { clip, phi, priceOf, sectorValue } from './scoring';
import type { WeightedInput } from './scoring';
import { checkOption, itemOf, replay } from './selection';
import { multiplierFor, thresholdFor } from './timing';

interface Answer {
  id: string;
  version: ItemVersion;
  step: Step;
  /** Option answered in the questionnaire. null when skipped. */
  answeredK: number | null;
  /** Option used for scoring, after overrides. */
  k: number | null;
  score: number | null;
  threshold: number;
  timeMultiplier: number;
  multiplier: number;
  source: Source;
  overridden: boolean;
}

function checkSource(source: Source, what: string): void {
  if (!SOURCES.includes(source)) throw new EngineError(`${what} has no valid source`);
}

export function computeV1(params: AlgoParamsV1, input: AlgoComputeInput): Result {
  const { bank, background, norm } = input;
  if (!Number.isInteger(background.age) || background.age < 0 || background.age >= bank.ages.length) {
    throw new EngineError('background age is missing or out of range');
  }
  const excluded = new Set<AreaId>(input.excludedAreas ?? []);
  const { context, path } = replay(params, bank, background, input.steps, input.excludedAreas);

  // Later overrides of the same question replace earlier ones.
  const overrides = new Map<string, Override>();
  for (const o of input.overrides ?? []) {
    itemOf(bank, o.itemId);
    checkSource(o.source, `override of "${o.itemId}"`);
    overrides.set(o.itemId, o);
  }

  // ---- answers on the path, and the inputs to the weighted means
  const answers: Answer[] = [];
  const byId = new Map<string, Answer>();
  const inputs: WeightedInput[] = [];
  for (const entry of path) {
    if (entry.step === null || entry.version === null) {
      // Not reached yet: counts as one of the sector's questions, without a score.
      inputs.push({ area: entry.item.area, load: entry.item.load, score: null, multiplier: 1 });
      continue;
    }
    const { step, version } = entry;
    checkSource(step.source, `step "${entry.id}"`);
    const threshold = thresholdFor(version.q[step.lang], step.lang, params.timing);
    const timeMultiplier = step.k === null ? 1 : multiplierFor(step.secs, threshold, params.timing);
    const override = overrides.get(entry.id);
    if (override) checkOption(version, entry.id, override.k);
    const k = override ? override.k : step.k;
    const answer: Answer = {
      id: entry.id,
      version,
      step,
      answeredK: step.k,
      k,
      score: k === null ? null : version.s[k],
      threshold,
      timeMultiplier,
      multiplier: override ? 1 : timeMultiplier,
      source: override ? override.source : step.source,
      overridden: override !== undefined,
    };
    answers.push(answer);
    byId.set(entry.id, answer);
    inputs.push({
      area: entry.item.area,
      load: version.load ?? entry.item.load,
      score: answer.score,
      multiplier: answer.multiplier,
    });
  }

  // ---- extras: synthetic items, full weight
  const extras: ExtraDetail[] = [];
  const extraIds = new Set<string>();
  for (const extra of input.extras ?? []) {
    if (typeof extra.id !== 'string' || extra.id.length === 0 || Object.hasOwn(bank.items, extra.id)) {
      throw new EngineError(`extra id "${extra.id}" is empty or is the id of a bank question`);
    }
    if (extraIds.has(extra.id)) throw new EngineError(`extra "${extra.id}" appears twice`);
    extraIds.add(extra.id);
    if (!AREA_IDS.includes(extra.area)) throw new EngineError(`extra "${extra.id}" has no valid sector`);
    if (!Number.isFinite(extra.score) || extra.score < 0 || extra.score > 1) {
      throw new EngineError(`extra "${extra.id}" needs a score between 0 and 1`);
    }
    for (const w of Object.values(extra.load)) {
      if (!Number.isFinite(w) || w < 0) throw new EngineError(`extra "${extra.id}" has an invalid load`);
    }
    // An extra is one of its sector's own items. Without a load on that sector it would be
    // dropped from the sector in silence and still be reported as counted.
    const ownLoad = extra.load[extra.area];
    if (ownLoad === undefined || !(ownLoad > 0)) {
      throw new EngineError(`extra "${extra.id}" needs a load above 0 on its own sector ${extra.area}`);
    }
    checkSource(extra.source, `extra "${extra.id}"`);
    const counted = !excluded.has(extra.area);
    extras.push({ id: extra.id, area: extra.area, source: extra.source, counted });
    if (counted) inputs.push({ area: extra.area, load: extra.load, score: extra.score, multiplier: 1 });
  }

  /** Effective score of a question. null when not asked, skipped, or the option is not scored. */
  const scoreOf = (id: string): number | null => byId.get(id)?.score ?? null;
  /** Effective option of a question. null when not asked or skipped. */
  const optionOf = (id: string): number | null => byId.get(id)?.k ?? null;
  /** Asked, and left without an answer. */
  const skippedAny = (ids: readonly string[]): boolean =>
    ids.some((id) => {
      const answer = byId.get(id);
      return answer !== undefined && answer.k === null;
    });

  // ---- sectors
  const normOf = (a: AreaId): SectorNorm => norm.byRole?.[background.role]?.[a] ?? norm.sectors[a];
  const interestScore = scoreOf(params.interest.itemId);
  const interestWrong = interestScore !== null && interestScore !== params.interest.correctScore;

  const sectors = {} as Record<AreaId, SectorResult>;
  for (const a of bank.order) {
    if (excluded.has(a)) {
      sectors[a] = { status: 'unlisted', price: null, priceFullWeight: null, keep: null, raw: null, ownItems: 0, ownScored: 0 };
      continue;
    }
    const { value, ownItems, ownScored } = sectorValue(params, a, inputs);
    if (value === null) {
      sectors[a] = { status: 'insufficient', price: null, priceFullWeight: null, keep: null, raw: null, ownItems, ownScored };
      continue;
    }
    const m = normOf(a);
    // Shrink toward the group median in proportion to the weight that was not kept.
    let x = value.keep * value.raw + (1 - value.keep) * m.median;
    let y = value.full;
    if (interestWrong && a === params.interest.area) {
      x = x + params.interest.shrink * (m.median - x);
      y = y + params.interest.shrink * (m.median - y);
    }
    sectors[a] = {
      status: 'listed',
      price: priceOf(params, x, m),
      priceFullWeight: priceOf(params, y, m),
      keep: value.keep,
      raw: x,
      ownItems,
      ownScored,
    };
  }

  // ---- overall
  const prices = {} as Record<AreaId, number | null>;
  for (const a of bank.order) prices[a] = sectors[a].price;
  const have = bank.order.filter((a) => sectors[a].price !== null);
  const leftOut = bank.order.filter((a) => sectors[a].price === null);
  const enough = have.length >= params.overall.minPricedSectors;
  const overall = enough ? have.reduce((sum, a) => sum + (sectors[a].price as number), 0) / have.length : null;
  const overallFullWeight = enough
    ? have.reduce((sum, a) => sum + (sectors[a].priceFullWeight as number), 0) / have.length
    : null;
  const rank = rankOf(prices, bank.order);

  // ---- questionnaire behaviour: time, checks, grade
  const given = answers.filter((a) => a.answeredK !== null);
  const skipped = answers.length - given.length;
  const keepAll = given.length === 0 ? 1 : given.reduce((sum, a) => sum + a.timeMultiplier, 0) / given.length;
  const roleQuestions = bank.extra[background.role].map((q) => q.id);
  const fewYears = RULES.checks.f12.fewYears.some(
    (q) => roleQuestions.includes(q.id) && background.extra[q.id] === q.option,
  );
  const positionsMissing = given.filter((a) => a.step.source === 'questionnaire' && a.step.where === undefined).length;
  const flagResult = flagsOf(params, {
    age: background.age,
    fewYears,
    tier: context.tier,
    k: (id) => byId.get(id)?.answeredK ?? null,
    keyOf: (id) => byId.get(id)?.version.key ?? null,
    answered: given.map((a) => ({
      score: a.version.s[a.answeredK as number],
      best: bestScore(a.version.s),
      where: a.step.where,
      timeMultiplier: a.timeMultiplier,
    })),
    asked: path.length,
  });

  // ---- social position: needs wealth, capability and the ladder answer
  const ladder = optionOf(RULES.ladderItem);
  const ladderVersion = byId.get(RULES.ladderItem)?.version;
  const wealth = sectors.W;
  const capability = sectors.C;
  let socialPosition: SocialPosition | null = null;
  if (ladder !== null && ladderVersion && wealth.price !== null && capability.price !== null) {
    const { rungs, markedGap } = params.social;
    const objectivePrice = (wealth.price + capability.price) / 2;
    const z = (objectivePrice - params.price.issue) / params.price.pointsPerSd;
    const objectiveRung = clip(Math.ceil(phi(z) * rungs), 1, rungs);
    const perOption = rungs / ladderVersion.opts.length;
    const low = ladder * perOption + 1;
    const high = (ladder + 1) * perOption;
    const gap = (low + high) / 2 - objectiveRung;
    socialPosition = {
      objectivePrice,
      objectiveRung,
      ladder,
      ladderRungs: [low, high],
      gap,
      gapKind: gap <= -markedGap ? 'below' : gap >= markedGap ? 'above' : 'close',
    };
  }

  // ---- contrasts. One that involves a skipped question does not fire.
  const contrasts: ContrastId[] = [];
  const compare = (x: number | null, y: number | null, threshold: number, high: ContrastId, low: ContrastId): void => {
    if (x === null || y === null) return;
    if (x - y >= threshold) contrasts.push(high);
    else if (y - x >= threshold) contrasts.push(low);
  };
  const mean = (ids: readonly string[]): number | null => {
    const scores = ids.map(scoreOf).filter((s): s is number => s !== null);
    return scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
  };
  const compareItems = (
    facts: readonly string[],
    feeling: readonly string[],
    threshold: number,
    high: ContrastId,
    low: ContrastId,
  ): void => {
    if (skippedAny(facts) || skippedAny(feeling)) return;
    compare(mean(facts), mean(feeling), threshold, high, low);
  };
  if (ladder !== null && ladderVersion && wealth.raw !== null && capability.raw !== null) {
    const ladderValue = ladder / (ladderVersion.opts.length - 1);
    compare((wealth.raw + capability.raw) / 2, ladderValue, params.contrasts.ladder, 'c1a', 'c1b');
  }
  const groups = RULES.contrasts;
  compareItems(groups.moneyFacts, groups.moneyWorry, params.contrasts.money, 'c2a', 'c2b');
  compareItems(groups.peopleFacts, groups.peopleLonely, params.contrasts.people, 'c3a', 'c3b');
  compareItems(groups.healthHabits, groups.healthRated, params.contrasts.health, 'c4a', 'c4b');
  const others = groups.mindOthers.map((a) => sectors[a].price);
  const mindPrice = sectors[groups.mind].price;
  if (mindPrice !== null && others.every((p): p is number => p !== null)) {
    const othersMean = others.reduce((sum, p) => sum + p, 0) / others.length;
    compare(othersMean, mindPrice, params.contrasts.mindPoints, 'c6a', 'c6b');
  }

  // ---- mind notice. mindAlert is the questionnaire rule. A notice from daily data arrives as
  // input.mindNotice. While either holds, the market view does not call mind the laggard.
  const mindAlert = RULES.mindNotice.every((q) => optionOf(q.id) === q.option);
  const mindNotice = mindAlert || input.mindNotice === true;

  // ---- market view
  const market = marketOf(params, prices, bank.order, mindNotice, input.previous);
  const type: [AreaId, AreaId] | null = !market.flat && rank.length >= 2 ? [rank[0], rank[1]] : null;

  const steps: StepDetail[] = answers.map((a) => ({
    id: a.id,
    key: a.version.key,
    section: itemOf(bank, a.id).area,
    k: a.k,
    answeredK: a.answeredK,
    skipped: a.answeredK === null,
    overridden: a.overridden,
    score: a.score,
    threshold: a.threshold,
    timeMultiplier: a.timeMultiplier,
    multiplier: a.multiplier,
    source: a.source,
  }));

  return {
    versions: { ...input.versions },
    normProvisional: norm.provisional,
    context,
    sectors,
    overall,
    overallFullWeight,
    overallCovers: enough ? have : [],
    overallLeftOut: leftOut,
    keepAll,
    reducedWeight: {
      count: answers.filter((a) => a.k !== null && a.multiplier < 1).length,
      points: overall !== null && overallFullWeight !== null ? Math.abs(overallFullWeight - overall) : null,
    },
    interestWrong,
    flags: flagResult.flags,
    flagPoints: flagResult.flagPoints,
    grade: flagResult.grade,
    contrasts,
    mindAlert,
    mindNotice,
    rank,
    socialPosition,
    type,
    market,
    counts: { total: path.length, answered: given.length, skipped },
    positionsMissing,
    steps,
    extras,
  };
}
