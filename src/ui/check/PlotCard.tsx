import type { CSSProperties } from 'react';
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
  /**
   * Five dashed outlines at the height of 100, one per lot: what the check will build. For the
   * introduction, so the picture says what the words say before the first question.
   */
  ghosts?: boolean;
  /**
   * On a phone, crop the sky away and keep the horizon, the lots and the street, so the steps
   * after the introduction start higher. From 960px, where the picture sits beside the steps,
   * the card keeps its full height.
   */
  compact?: boolean;
  className?: string;
}

const SEED = 7;
/**
 * Height of the compact crop in scene units: the bay near the shore, the lots and the street,
 * cut below the sailboat by the horizon so no part of it shows at the edge. About 115px on a phone.
 */
const COMPACT_H = 140;
/** Where a ghost outline sits inside its lot, the same span as the fence of an empty lot. */
const GHOST = { x: 12, w: 56 } as const;

/**
 * The plot before the check: the street by the bay, then one fenced lot after another. It is
 * the same scene and frame as the skyline of the check with nothing built yet, built from the
 * parts of the skyline. On the introduction five outlines show what the check will build.
 */
export function PlotCard({ lots, ghosts = false, compact = false, className }: PlotCardProps) {
  const p = SKY_VARS;
  const count = Math.max(0, Math.min(SECTOR_CODES.length, Math.round(lots)));
  const full = towerHeight(ISSUE_PRICE);
  // The crop of a skyline in build mode: room for a tower of 100.
  const top = viewTop([full]);
  const height = SCENE_H - top;
  // The compact crop: the lots and the street with a band of the bay behind them. The horizon,
  // and with it the 100 tag, is above it.
  const heightCompact = COMPACT_H;
  // Where the skyline puts the sun when every lot is empty: above the last lot.
  const sun = { x: lotX(SECTOR_CODES.length - 1) + LOT_W / 2, y: Math.max(top + 24, Math.min(HORIZON_Y - 30, GROUND_Y - 50)) };
  const scenery = { p, w: SCENE_W, top, detail: 2 as const, seed: SEED };
  const vars = {
    '--plot-ar': `${SCENE_W} / ${n1(height)}`,
    '--plot-ar-compact': `${SCENE_W} / ${n1(heightCompact)}`,
    '--plot-hundred': `${n1(((HORIZON_Y - top) / height) * 100)}%`,
  } as CSSProperties;
  return (
    <div className={cx(styles.plot, compact && styles.plotCompact, className)} style={vars}>
      <div className={cx(sky.sky, styles.plotSky)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 ${top} ${SCENE_W} ${n1(height)}`}
          role="img"
          aria-label={ghosts ? copy.plotGhosts : copy.plot(count)}
          focusable="false"
          preserveAspectRatio="xMidYMax slice"
        >
          <Backdrop {...scenery} sun={sun} />
          {ghosts &&
            SECTOR_CODES.map((code, i) => (
              <rect
                key={code}
                data-ghost={code}
                x={n1(lotX(i) + GHOST.x)}
                y={n1(GROUND_Y - full)}
                width={GHOST.w}
                height={n1(full)}
                rx={3}
                fill={p.ink}
                fillOpacity={0.04}
                stroke={p.ink}
                strokeOpacity={0.42}
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
            ))}
          {SECTOR_CODES.slice(0, count).map((code, i) => (
            <g key={code} transform={`translate(${n1(lotX(i))} ${GROUND_Y})`} data-lot={code}>
              <EmptyLot p={p} detail={2} />
            </g>
          ))}
          <Street {...scenery} />
        </svg>
        <span className={cx(sky.hundred, styles.plotHundred)} aria-hidden="true">
          100
        </span>
      </div>
    </div>
  );
}
