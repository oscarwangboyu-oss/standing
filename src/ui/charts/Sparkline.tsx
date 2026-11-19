import { ISSUE_PRICE } from '../format';
import { coord, polylinePoints, sharedDomain, xByIndex, yFraction, type Domain } from './scale';
import styles from './charts.module.css';

export interface SparklineProps {
  values: readonly number[];
  /** Pass one domain to every sparkline of a list (sharedDomain), so the 100 line means the same in each row. */
  domain?: Domain;
  width?: number;
  height?: number;
  /** Accessible name. Without it the sparkline is decoration next to the numbers. */
  label?: string;
  className?: string;
}

/** A small line of recent records with the 100 line. The stroke takes the sector colour when the parent sets one. */
export function Sparkline({ values, domain, width = 72, height = 28, label, className }: SparklineProps) {
  const d = domain ?? sharedDomain([values]);
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const xs = xByIndex(values.length);
  const y100 = pad + yFraction(ISSUE_PRICE, d) * h;
  const last = values[values.length - 1];
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <line className={styles.sparkPar} x1={0} x2={width} y1={coord(y100)} y2={coord(y100)} />
      {values.length > 1 && (
        <g transform={`translate(${pad} ${pad})`}>
          <polyline className={styles.sparkLine} points={polylinePoints(xs, values, d, w, h)} />
        </g>
      )}
      {last !== undefined && <circle className={styles.sparkDot} cx={coord(pad + (xs[xs.length - 1] ?? 1) * w)} cy={coord(pad + yFraction(last, d) * h)} r={3} />}
    </svg>
  );
}
