// Display order of the options. The caller supplies the random number, so the engine stays
// deterministic and a stored session can be replayed.

import { EngineError } from '../../types';
import type { ItemVersion, OrderDirection, Where } from '../../types';
import type { AlgoParamsV1 } from './params';

/** Which way the free options run for this random number in [0, 1): reversed (best_first) or bank order (worst_first). */
export function orderDirection(params: AlgoParamsV1, rngFloat: number): OrderDirection {
  return rngFloat < params.display.bestFirstBelow ? 'best_first' : 'worst_first';
}

/**
 * Option indices in display order for a direction: worst_first is the order of the bank,
 * best_first is that order reversed. Pinned options ("not applicable", "don't know") stay last
 * either way. This is `displayOrder` of the reference page, which only reverses and never
 * sorts by score. The bank lists most questions from the lowest score to the highest, which
 * is where the two names come from, but not all: the sleep question (B3) scores "7 to 9"
 * hours 1 and "More than 9" 0.625, so its best_first order opens with "More than 9". The
 * names are labels of the direction, not a promise about scores.
 */
export function displayOrderFor(version: ItemVersion, direction: OrderDirection): number[] {
  const free = version.opts.map((_, k) => k).filter((k) => !version.pin.includes(k));
  if (direction === 'best_first') free.reverse();
  return free.concat(version.pin);
}

export function displayOrder(params: AlgoParamsV1, version: ItemVersion, rngFloat: number): number[] {
  return displayOrderFor(version, orderDirection(params, rngFloat));
}

/** Whether option k sat first, last or in the middle of the displayed order. */
export function whereOf(k: number, order: readonly number[]): Where {
  const position = order.indexOf(k);
  if (position < 0) throw new EngineError(`option ${k} is not in the displayed order`);
  if (position === 0) return 'first';
  return position === order.length - 1 ? 'last' : 'middle';
}
