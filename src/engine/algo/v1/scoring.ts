// Sector values and prices. The arithmetic follows reference/test_page.html operation by
// operation, because the golden vectors are checked to 1e-9.

import type { AreaId, Loads, SectionId, SectorNorm } from '../../types';
import type { AlgoParamsV1 } from './params';

/** One input to the weighted means: an answered question, a question not scored, or an extra item. */
export interface WeightedInput {
  /** Sector the input belongs to. */
  area: SectionId;
  load: Loads;
  /** 0 to 1, or null when there is no score (option not scored, skipped, not reached yet). */
  score: number | null;
  /** Weight multiplier from the answer time. */
  multiplier: number;
}

export interface SectorValue {
  /** Weighted mean after the time discount, before shrinking to the median. */
  raw: number;
  /** Weighted mean with every answer at full weight. */
  full: number;
  /** Share of weight kept. */
  keep: number;
}

export interface SectorTally {
  /** null when the sector cannot be priced. */
  value: SectorValue | null;
  ownItems: number;
  ownScored: number;
}

/**
 * Value of one sector. Two thirds come from its own questions and one third from questions of
 * other sectors that load on it; each weight is load times multiplier. Inputs without a score
 * count as asked and stay out of the means. Without enough scored own questions there is no
 * value.
 */
export function sectorValue(params: AlgoParamsV1, area: AreaId, inputs: readonly WeightedInput[]): SectorTally {
  const { ownShare, otherShare, minOwnScoredShare } = params.sector;
  // own: discounted sum, discounted weight, full weight, full sum
  let on = 0;
  let od = 0;
  let of = 0;
  let fo = 0;
  // other sectors: the same four
  let sn = 0;
  let sd = 0;
  let sf = 0;
  let fs = 0;
  let ownItems = 0;
  let ownScored = 0;
  for (const input of inputs) {
    const w = input.load[area];
    if (!w) continue;
    const own = input.area === area;
    if (own) ownItems++;
    const s = input.score;
    if (s === null) continue;
    const m = input.multiplier;
    if (own) {
      on += w * m * s;
      od += w * m;
      of += w;
      fo += w * s;
      ownScored++;
    } else {
      sn += w * m * s;
      sd += w * m;
      sf += w;
      fs += w * s;
    }
  }
  if (!od || ownScored / ownItems < minOwnScoredShare) return { value: null, ownItems, ownScored };
  return {
    value: {
      raw: sd ? (ownShare * on) / od + (otherShare * sn) / sd : on / od,
      full: sf ? (ownShare * fo) / of + (otherShare * fs) / sf : fo / of,
      keep: sd ? ownShare * (od / of) + otherShare * (sd / sf) : od / of,
    },
    ownItems,
    ownScored,
  };
}

export function clip(x: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, x));
}

/** Price of an internal 0 to 1 value against the norm of its sector. */
export function priceOf(params: AlgoParamsV1, value: number, norm: SectorNorm): number {
  const { issue, pointsPerSd, min, max } = params.price;
  return clip(issue + (pointsPerSd * (value - norm.median)) / norm.sd, min, max);
}

/** Standard normal distribution function (Abramowitz and Stegun 26.2.17), as in the reference. */
export function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
