// From a measured number (hours of sleep, minutes of activity a week, months of savings, a
// share of take-home pay, hours of learning a year) to the option of the bank question it
// falls in. The micro apps use this to build overrides. The edges live in BANK_BANDS in
// config.ts.

import { BANK_BANDS } from './config';
import type { BankBand } from './config';
import { EngineError } from './types';

function tableOf(bankVersion: string, band: string): BankBand {
  if (!Object.hasOwn(BANK_BANDS, bankVersion)) throw new EngineError(`no bands for bank version "${bankVersion}"`);
  const bands = BANK_BANDS[bankVersion];
  if (!Object.hasOwn(bands, band)) throw new EngineError(`bank ${bankVersion} has no band "${band}"`);
  return bands[band];
}

/**
 * Position of the band `value` falls in, counted from the lowest band. A value belongs to the
 * last band it reaches: at or above the lower edge, or strictly above it where the band is
 * marked lowerExclusive. A value below the first edge (a negative number) is refused, as is
 * anything that is not a finite number.
 */
export function bandIndexFor(bankVersion: string, band: string, value: number): number {
  const { lowerEdges, lowerExclusive } = tableOf(bankVersion, band);
  if (!Number.isFinite(value)) throw new EngineError(`band "${band}" needs a finite number`);
  let reached = -1;
  lowerEdges.forEach((edge, i) => {
    if (lowerExclusive?.[i] ? value > edge : value >= edge) reached = i;
  });
  if (reached < 0) throw new EngineError(`${value} is below the first edge of band "${band}"`);
  return reached;
}

/**
 * Option index of the band `value` falls in.
 * `band` is a key of BANK_BANDS[bankVersion]: "B3", "B2", "W3", "W5:save", "W5:debt" or
 * "C_learn" in bank 2.1. See bandIndexFor for the rule.
 */
export function bandOptionFor(bankVersion: string, band: string, value: number): number {
  return tableOf(bankVersion, band).optionForBand[bandIndexFor(bankVersion, band, value)];
}

/**
 * The range an option stands for: its band position, its lower edge and the lower edge of the
 * next band (null for the highest band, which has no upper end).
 */
export function bandRangeOf(
  bankVersion: string,
  band: string,
  option: number,
): { index: number; lower: number; upper: number | null } {
  const { lowerEdges, optionForBand } = tableOf(bankVersion, band);
  const index = optionForBand.indexOf(option);
  if (index < 0) throw new EngineError(`band "${band}" has no option ${option}`);
  return { index, lower: lowerEdges[index], upper: index + 1 < lowerEdges.length ? lowerEdges[index + 1] : null };
}

/** Option index of the band at a position counted from the lowest band. */
export function bandOptionAt(bankVersion: string, band: string, index: number): number {
  const { optionForBand } = tableOf(bankVersion, band);
  if (!Number.isInteger(index) || index < 0 || index >= optionForBand.length) {
    throw new EngineError(`band "${band}" has no position ${index}`);
  }
  return optionForBand[index];
}
