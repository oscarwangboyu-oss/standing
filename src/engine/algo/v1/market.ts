// The data behind the one-line market commentary and the sector tags, following
// `renderResult` of reference/test_page.html. The engine returns data only; the words live in
// src/copy.

import type { AreaId, Market, MarketChange, PreviousPrices, SectorMove, SectorTag } from '../../types';
import type { AlgoParamsV1 } from './params';

type Prices = Partial<Record<AreaId, number | null>>;

function priced(prices: Prices, area: AreaId): number | null {
  return prices[area] ?? null;
}

/** Priced sectors from the highest to the lowest price. Ties keep the questionnaire order. */
export function rankOf(prices: Prices, order: readonly AreaId[]): AreaId[] {
  const have = order.filter((a) => priced(prices, a) !== null);
  return [...have].sort((x, y) => (prices[y] as number) - (prices[x] as number));
}

/**
 * Leader, laggard, tags and movers.
 * - Sectors less than the flat band apart are level: no leader and no laggard.
 * - A sector at the upper limit is tagged limit up, at the lower limit limit down; these win
 *   over leader and laggard.
 * - While the mind notice is shown, the mind sector is never the laggard and never tagged so.
 * - Movers need the previous record and at least `minMovers` sectors priced in both.
 * - `mindAlert` is true while the mind notice is shown, whatever its origin.
 */
export function marketOf(
  params: AlgoParamsV1,
  prices: Prices,
  order: readonly AreaId[],
  mindAlert: boolean,
  previous?: PreviousPrices | null,
): Market {
  const rank = rankOf(prices, order);
  const top = rank.length > 0 ? rank[0] : null;
  const bottom = rank.length > 0 ? rank[rank.length - 1] : null;
  const flat =
    top !== null && bottom !== null && (prices[top] as number) - (prices[bottom] as number) < params.market.flatBand;

  const leader = flat ? null : top;
  const laggard = flat || bottom === null || (mindAlert && bottom === 'M') ? null : bottom;

  const tags: Record<AreaId, SectorTag | null> = { C: null, W: null, N: null, B: null, M: null };
  for (const area of rank) {
    const price = prices[area] as number;
    if (price >= params.price.max) tags[area] = 'limit_up';
    else if (price <= params.price.min) tags[area] = 'limit_down';
    else if (area === leader) tags[area] = 'leader';
    else if (area === laggard) tags[area] = 'laggard';
  }

  return { pricedCount: rank.length, flat, leader, laggard, tags, change: changeOf(params, prices, previous) };
}

/**
 * How the sectors moved since the previous record.
 *
 * Deliberate departure from reference/test_page.html. The page says "every sector is up" when
 * no sector fell and "every sector is down" when no sector rose, so a change of exactly 0
 * counts as both. After a full check every sector moves and the two readings agree. The daily
 * open moves only body and mind, and the other three sectors change by 0 every day, where the
 * page's rule would say "every sector is down" for one sector down and four unchanged. Here a
 * change within the unchanged band is no move: all_up and all_down need every compared sector
 * to have moved that way, and some_up, some_down and unchanged cover the rest. Whenever every
 * compared sector moved by more than the band, the result equals the page's.
 */
function changeOf(params: AlgoParamsV1, prices: Prices, previous?: PreviousPrices | null): MarketChange | null {
  if (!previous) return null;
  const { showOrder, unchangedBand, minMovers } = params.market;
  const moves: SectorMove[] = [];
  const deltas: Partial<Record<AreaId, number>> = {};
  for (const area of showOrder) {
    const now = priced(prices, area);
    const before = priced(previous, area);
    if (now === null || before === null) continue;
    moves.push({ area, delta: now - before });
    deltas[area] = now - before;
  }
  if (moves.length < minMovers) return null;
  // Stable sort: equal moves stay in the order of the result page.
  moves.sort((x, y) => y.delta - x.delta);
  const gainer = moves[0];
  const loser = moves[moves.length - 1];
  const rose = moves.filter((m) => m.delta > unchangedBand).length;
  const fell = moves.filter((m) => m.delta < -unchangedBand).length;
  if (rose === 0 && fell === 0) return { kind: 'unchanged', topGainer: null, topLoser: null, deltas };
  if (fell === 0) return { kind: rose === moves.length ? 'all_up' : 'some_up', topGainer: gainer, topLoser: null, deltas };
  if (rose === 0) return { kind: fell === moves.length ? 'all_down' : 'some_down', topGainer: null, topLoser: loser, deltas };
  return { kind: 'mixed', topGainer: gainer, topLoser: loser, deltas };
}
