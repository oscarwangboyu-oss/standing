import { chart as copy, sectorNames } from '@/copy/common';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { PENTAGON, pentagonRing, pentagonShape, pentagonVertex } from './scale';
import styles from './charts.module.css';

export interface PentagonProps {
  /** The five prices. A sector without a price is null: its corner is left open. */
  prices: Partial<Record<SectorCode, number | null>>;
  /** A second shape, drawn as a dashed outline: the other person in a compare view. */
  other?: Partial<Record<SectorCode, number | null>>;
  /** Print the price under each sector code. Default on. */
  values?: boolean;
  className?: string;
}

const LABEL_RADIUS = PENTAGON.radius + 22;
const ANCHOR = ['middle', 'start', 'start', 'end', 'end'] as const;

/** The five sectors as a shape. The centre is 70, the rim is 130, and the ring at 100 is the issue price. */
export function Pentagon({ prices, other, values = true, className }: PentagonProps) {
  const list = SECTOR_CODES.map((code) => {
    const v = prices[code];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
  const shape = pentagonShape(list);
  const second = other
    ? pentagonShape(
        SECTOR_CODES.map((code) => {
          const v = other[code];
          return typeof v === 'number' && Number.isFinite(v) ? v : null;
        }),
      )
    : null;
  const label = copy.pentagon(SECTOR_CODES.map((code, i) => `${sectorNames[code]} ${list[i] === null ? 'no price' : formatPrice(list[i] as number)}`));
  return (
    <svg className={cx(styles.pentagon, className)} viewBox={`0 0 ${PENTAGON.width} ${PENTAGON.height}`} role="img" aria-label={label}>
      {PENTAGON.rings.map((r) => (
        <polygon key={r} className={r === 100 ? styles.ringPar : styles.ring} points={pentagonRing(r)} />
      ))}
      {SECTOR_CODES.map((code, i) => {
        const rim = pentagonVertex(i, 130);
        return <line key={code} className={styles.spoke} x1={PENTAGON.cx} y1={PENTAGON.cy} x2={rim.x.toFixed(1)} y2={rim.y.toFixed(1)} />;
      })}
      {second && second.count >= 3 && <polygon className={styles.shapeOther} points={second.points} />}
      {shape.count >= 3 && <polygon className={styles.shape} points={shape.points} />}
      {shape.count === 2 && <polyline className={styles.shape} points={shape.points} />}
      {SECTOR_CODES.map((code, i) => {
        const v = list[i];
        if (v === null || v === undefined) return null;
        const p = pentagonVertex(i, v);
        return <circle key={code} className={styles.vertex} style={{ fill: `var(--${code.toLowerCase()}-line)` }} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={6} />;
      })}
      {SECTOR_CODES.map((code, i) => {
        const angle = ((-90 + i * 72) * Math.PI) / 180;
        const x = PENTAGON.cx + LABEL_RADIUS * Math.cos(angle);
        const y = PENTAGON.cy + LABEL_RADIUS * Math.sin(angle) + (i === 0 ? -8 : i === 2 || i === 3 ? 12 : 2);
        const v = list[i];
        return (
          <text key={code} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={ANCHOR[i]} aria-hidden="true">
            <tspan className={styles.pCode} style={{ fill: `var(--${code.toLowerCase()}-deep)` }}>
              {code}
            </tspan>
            {values && v !== null && v !== undefined && (
              <tspan className={styles.pValue} x={x.toFixed(1)} dy={17}>
                {formatPrice(v)}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
