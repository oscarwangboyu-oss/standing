// Version registry. A result depends on three versions: the algorithm, the item bank and the
// norms. Every result stores all three, and every old version stays registered here, so any
// stored session can be recomputed the way it was first computed.
//
// To release a change:
// - algorithm: add src/engine/algo/vN (or new parameters in config.ts), register it in ALGOS;
// - bank: add src/engine/bank/vX_Y.json, register it in BANKS;
// - norms: add an entry to NORMS in config.ts;
// then point CURRENT at the new version. Never edit a version that has produced results.
//
// The tables are locked: a registered version cannot be replaced or removed at run time, and
// the parameters, norms and banks behind them are frozen. A script that tries out an altered
// algorithm (the recompute command) adds it under a new number with registerAlgo.

import { createAlgoV1 } from './algo/v1';
import { BANK_V2_1 } from './bank';
import { ALGO_PARAMS, NORMS as NORM_SETS } from './config';
import { EngineError } from './types';
import type { Algo, Bank, NormSet, VersionSet } from './types';

/** Algorithm version to implementation. Read it freely; add to it with registerAlgo only. */
export const ALGOS: Record<number, Algo> = {};

/**
 * Registers an algorithm under a version number that is not taken yet. The entry is locked:
 * it cannot be replaced or deleted afterwards. Meant for scripts and tests that compare an
 * altered algorithm with the current one, for example
 * registerAlgo(createAlgoV1(2, { ...structuredClone(ALGO_PARAMS[1]), ... })).
 */
export function registerAlgo(algo: Algo): Algo {
  const version = algo.version;
  if (!Number.isInteger(version) || version < 1) throw new EngineError('an algorithm version is a whole number from 1');
  if (Object.hasOwn(ALGOS, version)) throw new EngineError(`algorithm version ${version} is already registered`);
  Object.defineProperty(ALGOS, version, { value: algo, enumerable: true, writable: false, configurable: false });
  return algo;
}

registerAlgo(createAlgoV1(1, ALGO_PARAMS[1]));

/** Bank version to bank. Frozen, like the banks in it. */
export const BANKS: Record<string, Bank> = Object.freeze({
  [BANK_V2_1.bank_version]: BANK_V2_1,
});

/** Norm version to norms. Frozen in config.ts. */
export const NORMS: Record<string, NormSet> = NORM_SETS;

/** The versions new results are computed with. */
export const CURRENT: Readonly<VersionSet> = Object.freeze({ algo: 1, bank: '2.1', norm: 'provisional-1' });

export function getAlgo(version: number = CURRENT.algo): Algo {
  if (!Object.hasOwn(ALGOS, version)) throw new EngineError(`unknown algorithm version ${version}`);
  return ALGOS[version];
}

export function getBank(version: string = CURRENT.bank): Bank {
  if (!Object.hasOwn(BANKS, version)) throw new EngineError(`unknown bank version "${version}"`);
  return BANKS[version];
}

export function getNorm(version: string = CURRENT.norm): NormSet {
  if (!Object.hasOwn(NORMS, version)) throw new EngineError(`unknown norm version "${version}"`);
  return NORMS[version];
}
