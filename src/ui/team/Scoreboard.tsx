'use client';

/** The stage gates as a scoreboard, and the overview under it. */
import { team as copy } from '@/copy/team';
import type { TeamGate, TeamGatesResponse, TeamOverviewResponse } from '@/shared/api';
import { StatStrip, cx } from '@/ui';
import { roleLabel } from './labels';
import { Count, RateView, SMALL_N, Status, TableBox, line, num, pct } from './parts';
import styles from './team.module.css';

const IS_SHARE = (gate: TeamGate): boolean => gate.id !== 'retest_correlation';

function gateValue(gate: TeamGate, value: number | null): string {
  return IS_SHARE(gate) ? pct(value) : num(value, 2);
}

function gateLine(gate: TeamGate): string {
  const value = IS_SHARE(gate) ? line(gate.criterion) : gate.criterion.toFixed(2);
  return gate.direction === 'at_least' ? copy.gates.atLeast(value) : copy.gates.atMost(value);
}

const unit = (value: number): number => Math.min(1, Math.max(0, value));

/** The actual number as a bar from 0 to 1, with a mark at the gate. The figures are printed next to it. */
function Meter({ gate }: { gate: TeamGate }) {
  const at = unit(gate.criterion) * 100;
  return (
    <div className={styles.meter} aria-hidden="true">
      <div className={styles.meterTrack}>
        {gate.value !== null && <span className={styles.meterFill} style={{ width: `${unit(gate.value) * 100}%` }} />}
        <span className={styles.meterMark} style={{ left: `${at}%` }} />
      </div>
      <span className={cx(styles.meterLabel, at > 80 && styles.meterLabelEnd)} style={at > 80 ? { right: `${100 - at}%` } : { left: `${at}%` }}>
        {IS_SHARE(gate) ? line(gate.criterion) : gate.criterion.toFixed(2)}
      </span>
    </div>
  );
}

function GateRow({ gate }: { gate: TeamGate }) {
  const kind = gate.met === null ? 'none' : gate.met ? 'met' : 'not_met';
  const word = gate.met === null ? copy.gates.noData : gate.met ? copy.gates.met : copy.gates.notMet;
  let counts: string | null = null;
  if (gate.count !== null && gate.of !== null) counts = copy.common.of(gate.count, gate.of);
  else if (gate.id === 'retest_correlation' && gate.count !== null) counts = copy.gates.pairs(gate.count);
  else if (gate.note) counts = copy.gates.mostSkipped(gate.note);
  const small = gate.of !== null ? gate.of < SMALL_N : gate.id === 'retest_correlation' && gate.count !== null && gate.count < SMALL_N;
  return (
    <li className={styles.gate}>
      <div className={styles.gateText}>
        <h4 className={styles.gateName}>{copy.gates.names[gate.id]}</h4>
        <p className={styles.gateDetail}>
          {copy.gates.details[gate.id]}
          {gate.from === 'brief' && ` ${copy.gates.fromBrief}`}
        </p>
      </div>
      <dl className={styles.gateFigures}>
        <div className={styles.gateFigure}>
          <dt>{copy.gates.actual}</dt>
          <dd className={cx(styles.gateActual, gate.value === null && styles.none)}>{gate.value === null ? copy.common.noData : gateValue(gate, gate.value)}</dd>
          {counts && <dd className={cx(styles.gateCounts, small && styles.gateCountsSmall)}>{counts}</dd>}
        </div>
        <div className={styles.gateFigure}>
          <dt>{copy.gates.gate}</dt>
          <dd className={styles.gateLine}>{gateLine(gate)}</dd>
        </div>
      </dl>
      <Meter gate={gate} />
      <div className={styles.gateStatus}>
        <Status kind={kind}>{word}</Status>
      </div>
    </li>
  );
}

export function Gates({ data }: { data: TeamGatesResponse }) {
  const stages = [
    { stage: 1 as const, title: copy.gates.stage1, rule: copy.gates.stage1Rule },
    { stage: 2 as const, title: copy.gates.stage2, rule: copy.gates.stage2Rule },
  ];
  return (
    <div className={styles.board}>
      {stages.map(({ stage, title, rule }) => {
        const gates = data.gates.filter((g) => g.stage === stage);
        if (gates.length === 0) return null;
        const met = gates.filter((g) => g.from === 'deck' && g.met === true).length;
        const deck = gates.filter((g) => g.from === 'deck').length;
        return (
          <div key={stage} className={styles.stage}>
            <div className={styles.stageHead}>
              <div>
                <h3 className={styles.stageTitle}>{title}</h3>
                <p className={styles.stageRule}>{rule}</p>
              </div>
              <p className={styles.stageScore}>
                <span className={styles.stageScoreMain}>{copy.common.of(met, deck)}</span> {copy.gates.met.toLowerCase()}
              </p>
            </div>
            <ul className={styles.gates}>
              {gates.map((gate) => (
                <GateRow key={gate.id} gate={gate} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function Overview({ data }: { data: TeamOverviewResponse }) {
  const { sessions, people } = data.totals;
  return (
    <>
      <StatStrip
        stats={[
          { label: copy.overview.checksStarted, value: <Count n={sessions.of} /> },
          { label: copy.overview.checksCompleted, value: <Count n={sessions.count} /> },
          { label: copy.overview.peopleStarted, value: <Count n={people.of} /> },
          { label: copy.overview.peopleCompleted, value: <Count n={people.count} /> },
          { label: copy.overview.checkRate, value: <RateView rate={sessions} /> },
          { label: copy.overview.peopleRate, value: <RateView rate={people} /> },
          { label: copy.overview.retestPairs, value: <Count n={data.retest.pairs} /> },
          { label: copy.overview.retest, value: <span className={data.retest.correlation === null ? styles.none : undefined}>{num(data.retest.correlation, 2)}</span> },
        ]}
      />
      <p className={styles.footnote}>{copy.overview.retestWindow(data.retest.windowDays.min, data.retest.windowDays.max)}</p>
      <TableBox caption={copy.overview.caption} className={styles.gapTop}>
        <thead>
          <tr>
            <th scope="col">{copy.common.role}</th>
            <th scope="col" className={styles.numCol}>
              {copy.overview.checks}, {copy.overview.started.toLowerCase()}
            </th>
            <th scope="col">
              {copy.overview.checks}, {copy.overview.completed.toLowerCase()}
            </th>
            <th scope="col" className={styles.numCol}>
              {copy.overview.people}, {copy.overview.started.toLowerCase()}
            </th>
            <th scope="col">
              {copy.overview.people}, {copy.overview.completed.toLowerCase()}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.byRole.map((row) => (
            <tr key={row.role}>
              <th scope="row">{roleLabel(row.role)}</th>
              <td className={styles.numCol}>
                <Count n={row.sessions.of} />
              </td>
              <td>
                <RateView rate={row.sessions} />
              </td>
              <td className={styles.numCol}>
                <Count n={row.people.of} />
              </td>
              <td>
                <RateView rate={row.people} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableBox>
    </>
  );
}
