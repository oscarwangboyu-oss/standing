import type { ReactNode } from 'react';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { Skyline, type SkylineProps } from './Skyline';
import styles from './skylinecard.module.css';

export interface SkylineCardProps extends SkylineProps {
  /** Print each sector's ticker and price under its tower. Default on. */
  legend?: boolean;
  /** Something in the top left corner of the scene, such as the person's ticker chip. */
  corner?: ReactNode;
}

/**
 * A skyline on a card with each tower's ticker and price under it. The legend columns line up
 * with the lots, so the picture can be read as a chart.
 */
export function SkylineCard({ legend = true, corner, className, ...sky }: SkylineCardProps) {
  const small = sky.size === 'small';
  return (
    <div className={cx(styles.card, small && styles.small, className)}>
      <Skyline {...sky} framed={false} label={legend && !sky.build ? '' : sky.label} />
      {corner !== undefined && <div className={styles.corner}>{corner}</div>}
      {legend && (
        <dl className={styles.legend}>
          {SECTOR_CODES.map((code: SectorCode) => {
            const v = sky.prices[code];
            const listed = typeof v === 'number' && Number.isFinite(v) && !sky.build;
            return (
              <div key={code} className={styles.cell}>
                <dt className={styles.code} style={{ color: `var(--${code.toLowerCase()}-deep)` }}>
                  {code}
                </dt>
                <dd className={styles.value}>{listed ? formatPrice(v as number) : <span aria-hidden="true">·</span>}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
