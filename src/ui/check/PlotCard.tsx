import { start as copy } from '@/copy/check';
import { cx } from '../cx';
import { ISSUE_PRICE } from '../format';
import { SECTOR_CODES } from '../sectors';
import { EmptyLot } from '../skyline/buildings';
import { GROUND_Y, HORIZON_Y, LOT_W, SCENE_H, SCENE_W, lotX, n1, towerHeight, viewTop } from '../skyline/geometry';
import { SKY_VARS } from '../skyline/palette';
import { Backdrop, Street } from '../skyline/scenery';
import sky from '../skyline/skyline.module.css';
import styles from './check.module.css';

export interface PlotCardProps {
  /** How many of the five lots are marked out, from the left: 0 is the empty street. */
  lots: number;
  className?: string;
}

const SEED = 7;

/**
 * The plot before the check: the street by the bay, then one fenced lot after another. It is
 * the same scene, crop and frame as the skyline of the check with nothing built yet, so the
 * picture does not jump when the questions begin. Built from the parts of the skyline.
 */
export function PlotCard({ lots, className }: PlotCardProps) {
  const p = SKY_VARS;
  const count = Math.max(0, Math.min(SECTOR_CODES.length, Math.round(lots)));
  // The crop of a skyline in build mode: room for a tower of 100.
  const top = viewTop([towerHeight(ISSUE_PRICE)]);
  const height = SCENE_H - top;
  // Where the skyline puts the sun when every lot is empty: above the last lot.
  const sun = { x: lotX(SECTOR_CODES.length - 1) + LOT_W / 2, y: Math.max(top + 24, Math.min(HORIZON_Y - 30, GROUND_Y - 50)) };
  const scenery = { p, w: SCENE_W, top, detail: 2 as const, seed: SEED };
  return (
    <div className={cx(styles.plot, className)}>
      <div className={sky.sky} style={{ aspectRatio: `${SCENE_W} / ${n1(height)}` }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 ${top} ${SCENE_W} ${n1(height)}`}
          role="img"
          aria-label={copy.plot(count)}
          focusable="false"
          preserveAspectRatio="xMidYMax slice"
        >
          <Backdrop {...scenery} sun={sun} />
          {SECTOR_CODES.slice(0, count).map((code, i) => (
            <g key={code} transform={`translate(${n1(lotX(i))} ${GROUND_Y})`} data-lot={code}>
              <EmptyLot p={p} detail={2} />
            </g>
          ))}
          <Street {...scenery} />
        </svg>
        <span className={sky.hundred} style={{ top: `${n1(((HORIZON_Y - top) / height) * 100)}%` }} aria-hidden="true">
          100
        </span>
      </div>
    </div>
  );
}
