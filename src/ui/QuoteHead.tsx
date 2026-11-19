import type { ReactNode } from 'react';
import { quote } from '@/copy/common';
import { Change } from './Change';
import { cx } from './cx';
import type { OpenState } from './motion/useOpen';
import { Price } from './Price';
import { Ticker } from './Ticker';
import styles from './QuoteHead.module.css';

export interface QuoteHeadProps {
  ticker: string;
  /** The group the person is priced against: "Ages 21 to 24, employed full-time". */
  cohort?: ReactNode;
  price: number;
  /** The change since the last record. null on the first record. */
  change?: { value: number; pct?: number | null } | null;
  /** What the change is measured against. Default: "since the last record". */
  since?: ReactNode;
  /** State from useOpen: the price counts up once, then the change appears. */
  open?: OpenState;
  /** The heading level of the price line. Default h1. */
  as?: 'h1' | 'h2' | 'div';
  className?: string;
}

/** The top of a result or of the market home: who, the overall price, the change. */
export function QuoteHead({ ticker, cohort, price, change, since = quote.sinceLast, open, as: Heading = 'h1', className }: QuoteHeadProps) {
  const counting = open?.phase === 'pending' || open?.phase === 'running';
  const shown = open && counting ? open.value : price;
  return (
    <header className={cx(styles.head, counting && styles.counting, className)}>
      <div className={styles.who}>
        <Ticker variant="chip" size="md">
          {ticker}
        </Ticker>
        {cohort !== undefined && <span className={styles.cohort}>{cohort}</span>}
      </div>
      <Heading className={styles.priceLine}>
        <span className="vh">{quote.overall} </span>
        <Price value={shown} size="hero" />
      </Heading>
      <div className={styles.changeLine}>
        {change ? (
          <>
            <Change value={change.value} pct={change.pct} size="lg" />
            <span className={styles.since}>{since}</span>
          </>
        ) : (
          <span className={styles.first}>{quote.firstRecord}</span>
        )}
      </div>
    </header>
  );
}
