import { cx } from '../cx';
import { formatPrice } from '../format';
import type { SectorCode } from '../sectors';
import { TOWERS } from '../skyline/buildings';
import { FLOOR, n1, towerHeight } from '../skyline/geometry';
import { SKY_VARS, towerColors } from '../skyline/palette';
import styles from './scenes.module.css';

export interface ScaleFigureCopy {
  /** Read aloud in place of the drawing. */
  label: string;
  median: string;
  sd: string;
  sdNote: string;
  floor: string;
  limitUp: string;
  limitDown: string;
}

export interface ScaleFigureProps {
  /** The sector whose tower is drawn. */
  code: SectorCode;
  /** Its price. */
  price: number;
  copy: ScaleFigureCopy;
  className?: string;
}

const W = 360;
const H = 316;
/** The drawing starts just above the 145 line. */
const TOP = 30;
/** The street. */
const G = 286;
/** Left edge of the tower's lot. */
const LOT = 50;
const AXIS = 44;
/** Where the notes on the right start. */
const R = 150;
const y = (price: number) => G - towerHeight(price);
const TICKS = [55, 70, 85, 115, 130, 145] as const;
/** The third floor: the podium is 20 units, a floor is 11.5. */
const FLOOR_TOP = G - 20 - FLOOR * 2;

/**
 * How to read a price, as an elevation drawing: one tower next to the scale. The street is the
 * base, the dashed line is 100, each tick is one standard deviation, and one floor is five points.
 */
export function ScaleFigure({ code, price, copy, className }: ScaleFigureProps) {
  const p = SKY_VARS;
  const Tower = TOWERS[code];
  const roof = y(price);
  const k = code.toLowerCase();
  return (
    <svg className={cx(styles.scale, className)} viewBox={`0 ${TOP} ${W} ${H - TOP}`} role="img" aria-label={copy.label} focusable="false">
      {/* The street. */}
      <rect x={0} y={G} width={W} height={H - G} className={styles.scaleStreet} />
      <rect x={0} y={G} width={W} height={2.4} className={styles.scaleKerb} />

      {/* One standard deviation each way from the median, as a soft band behind the tower. */}
      <rect x={AXIS} y={y(115)} width={W - AXIS - 6} height={y(85) - y(115)} rx={8} className={styles.scaleBand} />

      {/* The limits. */}
      <path d={`M${AXIS} ${y(145)}H${W - 6}`} className={styles.scaleLimit} />
      <path d={`M${AXIS} ${y(55)}H${W - 6}`} className={styles.scaleLimit} />

      {/* The axis: one tick per standard deviation. */}
      <path d={`M${AXIS} ${y(145)}V${G}`} className={styles.scaleAxis} />
      {TICKS.map((t) => (
        <g key={t}>
          <path d={`M${AXIS - 6} ${n1(y(t))}h6`} className={styles.scaleAxis} />
          <text x={AXIS - 10} y={n1(y(t) + 4.2)} textAnchor="end" className={styles.scaleNum}>
            {t}
          </text>
        </g>
      ))}

      {/* The tower. */}
      <path d={`M${LOT + 24} ${G + 2.4}h47l11 8h-47z`} fill={p.ground2} opacity={0.55} />
      <g transform={`translate(${LOT} ${G})`}>
        <Tower h={towerHeight(price)} c={towerColors(p, code)} p={p} detail={2} lit={0.4} seed={11} />
      </g>

      {/* 100: the horizon. Drawn over the tower, as in every skyline. */}
      <path d={`M${AXIS - 6} ${n1(y(100))}H${W}`} className={styles.scalePar} />
      <rect x={1} y={n1(y(100) - 10)} width={38} height={20} rx={10} className={styles.scalePill} />
      <text x={20} y={n1(y(100) + 4.4)} textAnchor="middle" className={styles.scalePillText}>
        100
      </text>
      <text x={W - 8} y={n1(y(100) - 7)} textAnchor="end" className={styles.scaleNote}>
        {copy.median}
      </text>

      {/* The roof line is the price. */}
      <path d={`M${LOT + 71} ${n1(roof)}H${R}`} stroke={`var(--${k}-line)`} strokeWidth={1.5} />
      <rect x={R} y={n1(roof - 12)} width={66} height={24} rx={12} fill={`var(--${k}-deep)`} />
      <text x={R + 33} y={n1(roof + 4.8)} textAnchor="middle" className={styles.scalePrice}>
        {formatPrice(price)}
      </text>

      {/* One standard deviation. */}
      <path d={`M${R + 4} ${n1(y(100) + 4)}v${n1(y(85) - y(100) - 8)}M${R} ${n1(y(100) + 4)}h8M${R} ${n1(y(85) - 4)}h8`} className={styles.scaleAxis} />
      <text x={R + 16} y={n1((y(100) + y(85)) / 2 - 1)} className={styles.scaleStrong}>
        {copy.sd}
      </text>
      <text x={R + 16} y={n1((y(100) + y(85)) / 2 + 13)} className={styles.scaleNote}>
        {copy.sdNote}
      </text>

      {/* One floor. Floors are counted from the street. */}
      <path d={`M${R + 4} ${n1(FLOOR_TOP)}v${n1(FLOOR)}M${R} ${n1(FLOOR_TOP)}h8M${R} ${n1(FLOOR_TOP + FLOOR)}h8`} className={styles.scaleAxis} />
      <text x={R + 16} y={n1(FLOOR_TOP + FLOOR / 2 + 4)} className={styles.scaleNote}>
        {copy.floor}
      </text>

      <text x={W - 8} y={n1(y(145) - 7)} textAnchor="end" className={styles.scaleNote}>
        145 {copy.limitUp}
      </text>
      <text x={W - 8} y={n1(y(55) + 15)} textAnchor="end" className={styles.scaleNote}>
        55 {copy.limitDown}
      </text>
    </svg>
  );
}
