// From a measured number (hours of sleep, minutes of activity a week, months of savings, a
// share of take-home pay) to the option of the bank question it falls in. The daily open and
// the payday check use this to build overrides. The edges live in BANK_BANDS in config.ts.

import { BANK_BANDS } from './config';
import { EngineError } from './types';

/**
 * Option index of the band `value` falls in.
 * `band` is a key of BANK_BANDS[bankVersion]: "B3", "B2", "W3", "W5:save" or "W5:debt" in
 * bank 2.1. A value belongs to the last band it reaches: at or above the lower edge, or
 * strictly above it where the band is marked lowerExclusive. A value below the first edge
 * (a negative number) is refused, as is anything that is not a finite number.
 */
export function bandOptionFor(bankVersion: string, band: string, value: number): number {
  if (!Object.hasOwn(BANK_BANDS, bankVersion)) throw new EngineError(`no bands for bank version "${bankVersion}"`);
  const bands = BANK_BANDS[bankVersion];
  if (!Object.hasOwn(bands, band)) throw new EngineError(`bank ${bankVersion} has no band "${band}"`);
  const { lowerEdges, lowerExclusive, optionForBand } = bands[band];
  if (!Number.isFinite(value)) throw new EngineError(`band "${band}" needs a finite number`);
  let reached = -1;
  lowerEdges.forEach((edge, i) => {
    if (lowerExclusive?.[i] ? value > edge : value >= edge) reached = i;
  });
  if (reached < 0) throw new EngineError(`${value} is below the first edge of band "${band}"`);
  return optionForBand[reached];
}
