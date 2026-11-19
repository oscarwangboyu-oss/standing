import { cx } from '../cx';
import { Barrier, EmptyLot, MindTower, Scaffold, SkilTower, BodyTower } from './buildings';
import { SKY_VARS, towerColors } from './palette';
import { MOON } from './scenery';
import styles from './emblem.module.css';

/**
 * lot: nothing here yet (no history, no friend to compare with).
 * building: not enough data yet.
 * halted: a sector is halted and waits for a record.
 * sunrise: the day has not been opened yet.
 */
export type SpotKind = 'lot' | 'building' | 'halted' | 'sunrise';

export interface SpotProps {
  kind: SpotKind;
  /** Width in px. The height follows at 4:3. Default 160. */
  size?: number;
  className?: string;
}

/** A small scene for an empty state. Decoration: the sentence next to it says what is going on. */
export function Spot({ kind, size = 160, className }: SpotProps) {
  const p = SKY_VARS;
  return (
    <svg className={cx(styles.spot, className)} width={size} height={size * 0.75} viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <rect width={160} height={120} rx={24} fill={p.sky2} />
      <rect y={0} width={160} height={40} rx={0} fill={p.sky1} opacity={0.6} />
      {kind === 'sunrise' ? (
        <>
          <circle cx={80} cy={96} r={44} fill={p.halo} opacity={0.6} />
          <circle cx={80} cy={96} r={28} fill={p.sun} />
        </>
      ) : (
        <>
          <g style={{ opacity: p.dayOn }}>
            <circle cx={32} cy={30} r={11} fill={p.sun} />
          </g>
          <g style={{ opacity: p.nightOn }} transform="translate(124 26) scale(0.82)">
            <path d={MOON} fill={p.sun} />
          </g>
          <rect x={96} y={40} width={34} height={9} rx={4.5} fill={p.cloud} />
          <rect x={104} y={34} width={18} height={10} rx={5} fill={p.cloud} />
        </>
      )}
      <rect y={96} width={160} height={24} fill={p.ground} />
      <rect y={96} width={160} height={2} fill={p.ground2} />
      <path d="M0 108h160" stroke={p.path} strokeWidth={1.6} strokeDasharray="9 7" />
      <g transform="translate(40 96)">
        {kind === 'lot' && <EmptyLot p={p} detail={2} />}
        {kind === 'building' && <Scaffold p={p} detail={2} />}
        {kind === 'halted' && (
          <>
            <g opacity={0.5}>
              <MindTower h={62} c={towerColors(p, 'MIND')} p={p} detail={1} lit={0} seed={4} />
            </g>
            <Barrier p={p} />
          </>
        )}
        {kind === 'sunrise' && (
          <>
            <g transform="translate(-42 0) scale(0.8)">
              <BodyTower h={58} c={towerColors(p, 'BODY')} p={p} detail={1} lit={0.3} seed={2} />
            </g>
            <g transform="translate(54 0) scale(0.8)">
              <MindTower h={74} c={towerColors(p, 'MIND')} p={p} detail={1} lit={0.3} seed={5} />
            </g>
          </>
        )}
        {kind === 'building' && (
          <g transform="translate(-44 0) scale(0.62)">
            <SkilTower h={40} c={towerColors(p, 'SKIL')} p={p} detail={1} lit={0.2} seed={6} />
          </g>
        )}
      </g>
      <rect width={160} height={120} rx={24} fill="none" />
    </svg>
  );
}
