import { Fragment, type ReactNode } from 'react';
import type { Market, Result } from '@/engine';
import { market as copy } from '@/copy/result';
import { Change } from '../Change';
import { formatPrice } from '../format';
import { AREA_CODE } from '../sectors';
import { Tape, TapeCode } from '../Tape';
import { fill } from './fill';
import { paramsOf } from './model';

export interface MarketLineProps {
  result: Result;
  /** The market data to comment on (marketFor): the engine's leader, laggard and movers. */
  market: Market;
  /** True while the mind notice is shown. Mind is then never named as trailing or as the top loser. */
  notice: boolean;
  className?: string;
}

/**
 * The one-line market comment. Strengths first: the leader and the top gainer, then the laggard
 * and the top loser. When the priced sectors are within the flat band it says so and names
 * neither a leader nor a laggard.
 */
export function MarketLine({ result, market, notice, className }: MarketLineProps) {
  const sentences: ReactNode[] = [];
  const price = (area: keyof typeof AREA_CODE) => formatPrice(result.sectors[area].price ?? 0);
  const code = (area: keyof typeof AREA_CODE) => <TapeCode code={AREA_CODE[area]} />;
  const change = market.change;

  if (market.pricedCount === 0) sentences.push(copy.nonePriced);
  else if (market.pricedCount === 1) sentences.push(copy.onePriced);
  else if (market.flat) sentences.push(copy.flat(market.pricedCount, paramsOf(result.versions).market.flatBand));
  else if (market.leader) sentences.push(fill(copy.leads, { code: code(market.leader), price: price(market.leader) }));

  if (change?.kind === 'all_up') sentences.push(copy.allUp);
  if (change?.topGainer) {
    sentences.push(fill(copy.topGainer, { code: code(change.topGainer.area), change: <Change value={change.topGainer.delta} size="sm" /> }));
  }
  if (market.laggard && !(notice && market.laggard === 'M')) {
    sentences.push(fill(copy.laggard, { code: code(market.laggard), price: price(market.laggard) }));
  }
  if (change?.kind === 'all_down') sentences.push(copy.allDown);
  if (change?.topLoser && !(notice && change.topLoser.area === 'M')) {
    sentences.push(fill(copy.topLoser, { code: code(change.topLoser.area), change: <Change value={change.topLoser.delta} size="sm" /> }));
  }
  if (change?.kind === 'unchanged') sentences.push(copy.unchanged);

  return (
    <Tape className={className}>
      {sentences.map((sentence, index) => (
        <Fragment key={index}>
          {index > 0 ? ' ' : null}
          {sentence}
        </Fragment>
      ))}
    </Tape>
  );
}
