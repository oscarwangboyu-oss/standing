import type { CSSProperties, ReactNode } from 'react';
import { chart as copy } from '@/copy/common';
import { cx } from '../cx';
import { ISSUE_PRICE, formatDay, formatPrice } from '../format';
import { openClipRight } from '../motion/open';
import type { OpenState } from '../motion/useOpen';
import { coord, polylinePoints, priceDomain, xByDay, xByIndex, yFraction } from './scale';
import styles from './charts.module.css';

const W = 700;
const H = 300;
/** Histories up to this length are read out value by value. Longer ones are summarised. */
const READ_OUT_MAX = 12;

export interface ChartPoint {
  /** The day of the record, YYYY-MM-DD. */
  date: string;
  value: number;
  /** A full check was taken on this day. Marked with a ring on daily charts. */
  full?: boolean;
  /** A short label when the algorithm, question bank or norm version changed on this day, such as "Scoring v2". */
  version?: string;
}

export interface PriceChartProps {
  points: readonly ChartPoint[];
  /** What the line is, for the accessible name. Defaults to "Overall price". */
  name?: string;
  /** index: one step per record. day: spaced by calendar day, for histories with daily points. */
  spacing?: 'index' | 'day';
  /** Labels under the two ends of the axis. Defaults to the first and last day, as "Oct 1". */
  xLabels?: readonly [ReactNode, ReactNode];
  /** State from useOpen, so the line draws in step with the hero price. */
  open?: OpenState;
  caption?: ReactNode;
  className?: string;
}

/** Horizontal position of each point, 0 to 1. Pass the same to useOpen when the spacing is by day. */
export function chartXs(points: readonly ChartPoint[], spacing: 'index' | 'day' = 'index'): number[] {
  return spacing === 'day' ? xByDay(points.map((p) => p.date)) : xByIndex(points.length);
}

/**
 * The price over time with the line at the issue price, 100. Two stacked SVGs stretched to the
 * box: the grid, the 100 line and the area in one, the price line in the other so it can be
 * clipped while it draws. Labels and dots are HTML positioned in percent, so text and round
 * points never stretch with the SVG. The line takes the sector colour when the parent sets one.
 */
export function PriceChart({ points, name = copy.overall, spacing = 'index', xLabels, open, caption, className }: PriceChartProps) {
  const values = points.map((p) => p.value);
  const domain = priceDomain(values);
  const xs = chartXs(points, spacing);
  const phase = open?.phase ?? 'off';
  const pct = (f: number) => `${Math.round(f * 10000) / 100}%`;
  const y = (v: number) => yFraction(v, domain);
  const last = points[points.length - 1];
  const first = points[0];

  const formatted = values.map(formatPrice);
  const label =
    points.length === 0
      ? name
      : points.length <= READ_OUT_MAX
        ? copy.listed(name, formatted)
        : copy.summary(
            name,
            points.length,
            formatted[0] as string,
            formatted[formatted.length - 1] as string,
            formatPrice(Math.max(...values)),
            formatPrice(Math.min(...values)),
          );

  const clip: CSSProperties | undefined =
    phase === 'running' && open ? { clipPath: `inset(-10% ${openClipRight(open.drawn)}% -10% 0)` } : phase === 'pending' ? { clipPath: 'inset(-10% 100% -10% 0)' } : undefined;

  const ends: readonly [ReactNode, ReactNode] | null = xLabels ?? (first && last ? [formatDay(first.date), formatDay(last.date)] : null);
  const line = points.length > 1 ? polylinePoints(xs, values, domain, W, H) : '';
  const y100 = coord(y(ISSUE_PRICE) * H);

  return (
    <figure className={cx(styles.chart, className)} data-open={phase === 'off' ? undefined : phase}>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {domain.ticks
            .filter((t) => t !== ISSUE_PRICE)
            .map((t) => (
              <line key={t} className={styles.grid} x1={0} x2={W} y1={coord(y(t) * H)} y2={coord(y(t) * H)} />
            ))}
          {line && <polygon className={styles.area} style={clip} points={`0,${y100} ${line} ${W},${y100}`} />}
          <line className={styles.par} x1={0} x2={W} y1={y100} y2={y100} />
          {points.map((p, i) => (p.version ? <line key={i} className={styles.mark} x1={(xs[i] as number) * W} x2={(xs[i] as number) * W} y1={0} y2={H} /> : null))}
        </svg>
        <svg className={styles.lineSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} style={clip}>
          {line && <polyline className={styles.line} points={line} />}
        </svg>
        {points.map((p, i) =>
          p.full && i < points.length - 1 ? (
            <span key={i} className={styles.full} style={{ left: pct(xs[i] as number), top: pct(y(p.value)) }}>
              <span className="vh">
                {copy.fullCheck}, {formatDay(p.date)}
              </span>
            </span>
          ) : null,
        )}
        {last && <span className={styles.dot} style={{ left: pct(xs[xs.length - 1] as number), top: pct(y(last.value)) }} />}
        {points.map((p, i) =>
          p.version ? (
            <span key={i} className={cx(styles.markLabel, (xs[i] as number) > 0.5 && styles.markLabelLeft)} style={{ left: pct(xs[i] as number) }}>
              <span className="vh">
                {copy.versionChange}, {formatDay(p.date)}:{' '}
              </span>
              {p.version}
            </span>
          ) : null,
        )}
        {domain.ticks.map((t) => (
          <span key={t} className={cx(styles.y, t === ISSUE_PRICE && styles.yPar)} style={{ top: pct(y(t)) }} aria-hidden="true">
            {t}
          </span>
        ))}
      </div>
      {ends && (
        <div className={cx(styles.x, points.length === 1 && styles.xEnd)}>
          {points.length > 1 && <span>{ends[0]}</span>}
          <span>{ends[1]}</span>
        </div>
      )}
      {caption !== undefined && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
