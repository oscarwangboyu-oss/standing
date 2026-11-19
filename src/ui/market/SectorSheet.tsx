import { quote } from '@/copy/common';
import { moved as copy, sectorLines } from '@/copy/market';
import type { AreaId } from '@/engine';
import type { DayBreakdownResponse, MeLive } from '@/shared/api';
import { Change } from '../Change';
import { formatDay, formatPrice } from '../format';
import { Price } from '../Price';
import { Tag, sectorStyle } from '../Tag';
import { codeOf, isCatchingUp } from './live';
import { MoveBreakdown } from './MoveBreakdown';
import styles from './market.module.css';

export interface SectorSheetProps {
  live: MeLive;
  area: AreaId;
  breakdown: { data: DayBreakdownResponse | null; loading: boolean; error: boolean; onRetry: () => void };
}

/** The body of the "Why it moved" sheet of one sector: today's quote, then the breakdown of the latest change. */
export function SectorSheet({ live, area, breakdown }: SectorSheetProps) {
  const sector = live.sectors[area];
  const priced = sector.price !== null && (sector.status === 'listed' || sector.status === 'halted');
  return (
    <div style={sectorStyle(codeOf(area))}>
      <div className={styles.sheetQuote}>
        {priced ? (
          <div className={styles.sheetPrice}>
            <Price value={sector.price as number} size="lg" />
            {sector.status === 'halted' ? (
              <Tag kind="halted" />
            ) : (
              sector.change !== null && (
                <>
                  <Change value={sector.change} />
                  <span className={styles.sheetSince}>{copy.sinceYesterday}</span>
                </>
              )
            )}
            {sector.resumed && <Tag kind="resumed" />}
          </div>
        ) : (
          <p className={styles.sheetNote}>{sector.status === 'unlisted' ? quote.notListed : quote.notEnoughData}</p>
        )}
        {priced && (
          <div className={styles.sheetFacts}>
            {isCatchingUp(sector) && (
              <p className={styles.sheetFact}>
                <span>{copy.target}</span>
                <span>{formatPrice(sector.target as number)}</span>
              </p>
            )}
            {sector.sinceCheck !== null && (
              <p className={styles.sheetFact}>
                <span>{copy.sinceCheck}</span>
                <Change value={sector.sinceCheck} size="sm" />
              </p>
            )}
          </div>
        )}
        {sector.status === 'halted' && sector.haltedSince && <p className={styles.sheetNote}>{copy.halted(formatDay(sector.haltedSince))}</p>}
        {sector.dailyLimit && <p className={styles.sheetNote}>{sectorLines.limit(live.moveLimit)}</p>}
      </div>
      {priced && (
        <MoveBreakdown
          className={styles.sheetBreakdown}
          data={breakdown.data}
          loading={breakdown.loading}
          error={breakdown.error}
          onRetry={breakdown.onRetry}
          areas={[area]}
          limit={live.moveLimit}
        />
      )}
    </div>
  );
}
