// Version registry. A result depends on three versions: the algorithm, the item bank and the
// norms. Every result stores all three, and every old version stays registered here, so any
// stored session can be recomputed the way it was first computed.
//
// HOW TO ADD ALGORITHM VERSION 2 NEXT TO VERSION 1
//
// A. Only values change (weights, thresholds, the daily limit, a micro-app rule):
//    1. config.ts: copy the whole block ALGO_PARAMS[1] to a new key 2 and change the values
//       there. Leave block 1 as it is.
//    2. This file: under the line that registers version 1, add
//         registerAlgo(createAlgoV1(2, ALGO_PARAMS[2]));
//    3. This file: set CURRENT.algo to 2.
//
// B. The rules themselves change (how a sector value is built, a new check, another shape of
//    parameters):
//    1. Copy the folder algo/v1 to algo/v2. In algo/v2 rename createAlgoV1 to createAlgoV2,
//       computeV1 to computeV2 and AlgoParamsV1 to AlgoParamsV2, then make the change there.
//       Do not touch algo/v1.
//    2. config.ts: add the parameters of version 2. When their shape differs from version 1,
//       keep them in a table of their own (ALGO_PARAMS_V2) typed AlgoParamsV2.
//    3. This file: import createAlgoV2 and add registerAlgo(createAlgoV2(2, ...)) under the
//       line that registers version 1.
//    4. This file: set CURRENT.algo to 2.
//
// Then, for A and B alike:
//    5. Tests: the 335 reference cases pin version 1. Keep them running with
//       versions: { algo: 1 } (tests/unit/engine/golden.test.ts computes with the default, so
//       pass the version there once CURRENT moves), and add the cases that show what version 2
//       changes.
//    6. Run "npm run recompute" with the new version on all stored sessions and read the
//       comparison (rank correlation, share moving more than RECOMPUTE_MOVE_POINTS) before
//       release. versionEffectTest in evaluation.ts gives the same two numbers a verdict.
//    7. Record the day of the switch. The timeline takes it as
//       versionChanges: [{ day, versions: { algo: 2 } }] and marks that day on the chart; a
//       series computed with versions: { algo: 1 } and no change still gives the old numbers.
//
// A new bank goes the same way: add src/engine/bank/vX_Y.json, register it in BANKS, add its
// bands to BANK_BANDS, point CURRENT.bank at it. New norms: add an entry to NORMS in
// config.ts and point CURRENT.norm at it. Never edit a version that has produced results.
//
// algo/test-variant.ts is a worked example of path A that is used by tests only.
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
