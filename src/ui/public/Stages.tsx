import { about as copy } from '@/copy/public';
import { sample } from '@/copy/landing';
import { cx } from '../cx';
import { SECTOR_CODES } from '../sectors';
import { EmptyLot, Scaffold, TOWERS } from '../skyline/buildings';
import { LOT_W, towerHeight } from '../skyline/geometry';
import { SKY_VARS, towerColors } from '../skyline/palette';
import styles from './page.module.css';

const P = SKY_VARS;
const W = LOT_W * 5;
const H = 184;
const G = H;

/** The five lots of one stage: built, under scaffolding, fenced, or only marked out. */
function StageScene({ stage, label }: { stage: number; label: string }) {
  return (
    <svg className={styles.stageScene} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} focusable="false">
      {SECTOR_CODES.map((code, i) => {
        const Tower = TOWERS[code];
        return (
          <g key={code} transform={`translate(${i * LOT_W} ${G})`}>
            {stage === 0 && <Tower h={towerHeight(sample.prices[code])} c={towerColors(P, code)} p={P} detail={1} lit={0.4} seed={21 + i} />}
            {stage === 1 && (
              <g transform="translate(-10 0) scale(1.25)">
                <Scaffold p={P} detail={2} />
              </g>
            )}
            {stage === 2 && (
              <g transform="translate(-10 0) scale(1.25)">
                <EmptyLot p={P} detail={2} />
              </g>
            )}
            {stage === 3 && (
              <g transform="translate(-10 0) scale(1.25)">
                <EmptyLot p={P} detail={0} />
              </g>
            )}
          </g>
        );
      })}
      {stage === 1 && (
        <g transform={`translate(${LOT_W * 2 + 40} ${G})`} fill="none" stroke={P.crane} strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 0V-132" strokeWidth={4} />
          <path d="M-46 -124H96M0 -140L-46 -124M0 -140L96 -124" strokeWidth={2.4} />
          <path d="M70 -124V-96" stroke={P.ink} strokeWidth={1.2} />
          <rect x={62} y={-96} width={16} height={11} rx={1.5} fill={P.crane} stroke="none" />
          <rect x={-40} y={-124} width={18} height={12} fill={P.ink} stroke="none" opacity={0.75} />
        </g>
      )}
    </svg>
  );
}

/**
 * The plan in four stages, as four stretches of one street: the first is built, the second is
 * under scaffolding, the last two are lots. Each stage names the numbers that open the next one.
 */
export function Stages() {
  const { plan } = copy;
  return (
    <ol className={styles.stages}>
      {plan.stages.map((stage, i) => (
        <li key={stage.name} className={cx(styles.stage, i === 0 && styles.stageNow)}>
          <div className={styles.stageArt}>
            <StageScene stage={i} label={plan.sceneLabels[i] ?? ''} />
          </div>
          <div className={styles.stageText}>
            <p className={styles.stageWhen}>
              <span className={styles.stageNo}>{plan.stage(i + 1)}</span>
              <span className={styles.stageTime}>{stage.when}</span>
            </p>
            <h3 className={styles.stageName}>{stage.name}</h3>
            <p className={styles.stageBody}>{stage.text}</p>
            <div className={styles.gate}>
              <p className={styles.gateLabel}>{stage.gateKind === 'gate' ? plan.gateLabel : plan.startLabel}</p>
              <p className={styles.gateText}>{stage.gate}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
