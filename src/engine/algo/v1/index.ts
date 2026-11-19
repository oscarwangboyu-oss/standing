// Algorithm version 1: the behaviour of reference/python/items2.py and reference/test_page.html,
// plus skips, sectors without consent, overrides and extras.
//
// Everything whose behaviour belongs to this version lives in this folder. Do not change it
// once results have been stored under it: copy the folder to the next version instead, so old
// results can be recomputed exactly.
//
// Where version 1 departs from the reference on purpose:
// - Market movers (market.ts): a sector that did not move is not counted as up or down, so
//   "every sector is up" and "every sector is down" need every compared sector to have moved.
//   The reference rule reads a change of 0 as both. The golden vectors do not cover this line.
// - Checks f9, f10 and f11 (flags.ts) run over every question on the path, so a skip or an
//   unfinished session can never add a check. The reference has neither skips nor unfinished
//   sessions; on a finished session without a skip the two agree.
// - readUnits (timing.ts) gives 0 for a blank English string, as items2.py does. The test
//   page gives 1. The time threshold is the same.
// Kept as in the reference although it looks like a slip: the 2 point level of check f10
// cannot fire (see flags.speeding in config.ts).

import { deepCopy, deepFreeze } from '../../freeze';
import type { Algo } from '../../types';
import { computeV1 } from './compute';
import { displayOrder, displayOrderFor, orderDirection, whereOf } from './display';
import { marketOf } from './market';
import type { AlgoParamsV1 } from './params';
import { contextOf, nextQuestion, progressOf } from './selection';
import { multiplierFor, readUnits, thresholdFor } from './timing';

/**
 * Binds the version 1 code to one set of parameters. The algorithm keeps its own frozen copy
 * of them, so a later write to the object passed in cannot change its results.
 */
export function createAlgoV1(version: number, source: AlgoParamsV1): Algo {
  const params = deepFreeze(deepCopy(source));
  return Object.freeze<Algo>({
    version,
    timing: params.timing,
    contextOf,
    nextQuestion: (bank, background, steps, opts) => nextQuestion(params, bank, background, steps, opts?.excludedAreas),
    progressOf: (bank, background, steps, opts) => progressOf(params, bank, background, steps, opts?.excludedAreas),
    orderDirection: (rngFloat) => orderDirection(params, rngFloat),
    displayOrder: (itemVersion, rngFloat) => displayOrder(params, itemVersion, rngFloat),
    displayOrderFor,
    whereOf,
    readUnits,
    thresholdFor: (text, lang, timing) => thresholdFor(text, lang, timing ?? params.timing),
    multiplierFor: (secs, threshold, timing) => multiplierFor(secs, threshold, timing ?? params.timing),
    marketOf: (prices, order, mindAlert, previous) => marketOf(params, prices, order, mindAlert, previous),
    compute: (input) => computeV1(params, input),
  });
}

export type { AlgoParamsV1, DailyOpenParams, PaydayParams } from './params';
