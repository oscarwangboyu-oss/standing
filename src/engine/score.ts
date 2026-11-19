// compute: the one entry to scoring. It resolves the three versions and hands the input to
// the algorithm version asked for. index.ts re-exports it; the timeline and the breakdown
// call it from here.

import { CURRENT, getAlgo, getNorm } from './registry';
import { EngineError } from './types';
import type { ComputeInput, Result } from './types';

/**
 * Scores a session. The result carries the algorithm, bank and norm versions it was computed
 * with. A session that is not finished can be scored too: unreached questions have no score.
 */
export function compute(input: ComputeInput): Result {
  const bankVersion = input.bank.bank_version;
  if (input.versions?.bank !== undefined && input.versions.bank !== bankVersion) {
    throw new EngineError(`versions.bank is "${input.versions.bank}" but the bank passed in is "${bankVersion}"`);
  }
  const versions = {
    algo: input.versions?.algo ?? CURRENT.algo,
    bank: bankVersion,
    norm: input.versions?.norm ?? CURRENT.norm,
  };
  return getAlgo(versions.algo).compute({ ...input, versions, norm: getNorm(versions.norm) });
}
