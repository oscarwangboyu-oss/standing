import { method as copy } from '@/copy/public';
import { sample } from '@/copy/landing';
import { Ruler } from '../charts/Ruler';
import { Ticker } from '../Ticker';
import styles from './page.module.css';

/** Two thirds from a sector's own questions, one third from related questions in other sectors. */
export function SplitFigure() {
  const { split } = copy;
  return (
    <figure className={styles.card} aria-label={split.label}>
      <div className={styles.split} aria-hidden="true">
        <div className={styles.splitOwn}>
          <span className={styles.splitShare}>{split.ownShare}</span>
          <span className={styles.splitName}>{split.own}</span>
        </div>
        <div className={styles.splitOther}>
          <span className={styles.splitShare}>{split.otherShare}</span>
          <span className={styles.splitName}>{split.other}</span>
        </div>
      </div>
    </figure>
  );
}

/** The price scale from 55 to 145 with the sample on it. */
export function ScaleRulerFigure() {
  return (
    <figure className={styles.card}>
      <figcaption className={styles.cardLabel}>
        <Ticker variant="chip" size="sm">
          {sample.ticker}
        </Ticker>
        {copy.rulerLabel}
      </figcaption>
      <Ruler value={sample.price} />
    </figure>
  );
}

/** Data grade A, B or C by the points of the checks that fired. */
export function GradeFigure() {
  const { grades } = copy;
  return (
    <figure className={styles.card}>
      <figcaption className={styles.cardLabel}>{grades.label}</figcaption>
      <dl className={styles.grades}>
        {grades.list.map((g) => (
          <div key={g.grade}>
            <dt>{g.grade}</dt>
            <dd>{g.points}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

const W = 380;
const H = 178;
const L = 96;
const R = W - 14;
const Y_FULL = 26;
const Y_HALF = 82;
const Y_AXIS = 124;
const X_HALF = Math.round(L + (R - L) * 0.25);
const X_FULL = Math.round(L + (R - L) * 0.62);

/** The weight of an answer by the time it took: half weight up to half the threshold, full weight from the threshold. */
export function TimingFigure() {
  const { timing } = copy;
  return (
    <figure className={styles.card}>
      <svg className={styles.timing} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={timing.label} focusable="false">
        <path d={`M${L} ${Y_FULL}H${R}M${L} ${Y_HALF}H${R}`} className={styles.timingGrid} />
        <path d={`M${L} ${Y_AXIS}H${R}`} className={styles.timingAxis} />
        <path d={`M${X_HALF} ${Y_AXIS}v6M${X_FULL} ${Y_AXIS}v6`} className={styles.timingAxis} />
        <path d={`M${L} ${Y_HALF}H${X_HALF}L${X_FULL} ${Y_FULL}H${R}V${Y_AXIS}H${L}z`} className={styles.timingArea} />
        <path d={`M${L} ${Y_HALF}H${X_HALF}L${X_FULL} ${Y_FULL}H${R}`} className={styles.timingLine} />
        <circle cx={X_HALF} cy={Y_HALF} r={5} className={styles.timingDot} />
        <circle cx={X_FULL} cy={Y_FULL} r={5} className={styles.timingDot} />
        <text x={L - 12} y={Y_FULL + 4.5} textAnchor="end" className={styles.timingStrong}>
          {timing.full}
        </text>
        <text x={L - 12} y={Y_HALF + 4.5} textAnchor="end" className={styles.timingStrong}>
          {timing.half}
        </text>
        <text x={X_HALF} y={Y_AXIS + 22} textAnchor="middle" className={styles.timingNote}>
          {timing.halfway}
        </text>
        <text x={X_FULL - 10} y={Y_AXIS + 22} className={styles.timingNote}>
          {timing.threshold}
        </text>
        <text x={L} y={Y_AXIS + 44} className={styles.timingNote}>
          {timing.time}
        </text>
        <path d={`M${L + 76} ${Y_AXIS + 40}h22m-5 -4l5 4l-5 4`} className={styles.timingAxis} />
      </svg>
      <figcaption className={styles.cardNote}>{timing.caption}</figcaption>
    </figure>
  );
}
