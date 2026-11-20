'use client';

/** The stage gates as a scoreboard, and the overview under it. */
import { team as copy } from '@/copy/team';
import type { Rate, TeamGate, TeamGatesResponse, TeamOverviewResponse } from '@/shared/api';
import { IconMinus, StatStrip, cx } from '@/ui';
import { roleLabel } from './labels';
import { Count, RateView, SMALL_N, SmallNote, Status, TableBox, line, num, pct } from './parts';
import styles from './team.module.css';

const IS_SHARE = (gate: TeamGate): boolean => gate.id !== 'retest_correlation';

export function gateValue(gate: TeamGate, value: number | null): string {
  return IS_SHARE(gate) ? pct(value) : num(value, 2);
}

export function gateLine(gate: TeamGate): string {
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
        {gate.value !== null && (
          <span className={cx(styles.meterFill, gate.met === false && styles.meterFillDown)} style={{ width: `${unit(gate.value) * 100}%` }} />
        )}
        <span className={styles.meterMark} style={{ left: `${at}%` }} />
      </div>
      <span className={cx(styles.meterLabel, at > 80 && styles.meterLabelEnd)} style={at > 80 ? { right: `${100 - at}%` } : { left: `${at}%` }}>
        {IS_SHARE(gate) ? line(gate.criterion) : gate.criterion.toFixed(2)}
      </span>
    </div>
  );
}

/** What the actual value rests on: "277 of 331", "N4/base, skipped in 46 of 362 checks", "64 pairs". */
export function gateCounts(gate: TeamGate): string | null {
  if (gate.id === 'max_item_skip_rate' && gate.note && gate.count !== null && gate.of !== null) {
    return copy.gates.skippedIn(gate.note, gate.count, gate.of);
  }
  if (gate.id === 'max_item_skip_rate' && gate.value === null) return copy.gates.skipNone(SMALL_N);
  if (gate.count !== null && gate.of !== null) return copy.common.of(gate.count, gate.of);
  if (gate.id === 'retest_correlation' && gate.count !== null) return copy.gates.pairs(gate.count);
  if (gate.note) return copy.gates.mostSkipped(gate.note);
  return null;
}

function GateRow({ gate }: { gate: TeamGate }) {
  const kind = gate.met === null ? 'none' : gate.met ? 'met' : 'not_met';
  const word = gate.met === null ? copy.gates.noData : gate.met ? copy.gates.met : copy.gates.notMet;
  const counts = gateCounts(gate);
  const small = gate.of !== null ? gate.of < SMALL_N : gate.id === 'retest_correlation' && gate.count !== null && gate.count < SMALL_N;
  return (
    <li className={cx(styles.gate, gate.met === false && styles.gateDown)} id={`team-gate-${gate.id}`}>
      <div className={styles.gateText}>
        <h4 className={styles.gateName}>{copy.gates.names[gate.id]}</h4>
        <p className={styles.gateDetail}>
          {copy.gates.details[gate.id]}
          {gate.id === 'max_item_skip_rate' && ` ${copy.gates.skipRule(SMALL_N)}`}
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
        const notMet = gates.filter((g) => g.from === 'deck' && g.met === false).length;
        const deck = gates.filter((g) => g.from === 'deck').length;
        return (
          <div key={stage} className={styles.stage}>
            <div className={styles.stageHead}>
              <div>
                <h3 className={styles.stageTitle}>{title}</h3>
                <p className={styles.stageRule}>{rule}</p>
              </div>
              <div className={styles.stageScoreLine}>
                <p className={styles.stageScore}>
                  <span className={styles.stageScoreMain}>{copy.common.of(met, deck)}</span> {copy.gates.met.toLowerCase()}
                </p>
                {notMet > 0 && (
                  <span className={styles.stageNotMet}>
                    <IconMinus size={14} />
                    {copy.gates.notMetCount(notMet)}
                  </span>
                )}
              </div>
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

/** "+25 from 6", "Same as before, 6", "None in the 7 days before". */
function changeOf(now: number, before: number, days: number): string {
  if (before === 0) return now === 0 ? copy.overview.sameAs('0') : copy.overview.noneBefore(days);
  if (now === before) return copy.overview.sameAs(String(before));
  return copy.overview.from(copy.common.signed(now - before), String(before));
}

/** "+13.5 points from 83.3%", in percentage points. */
function rateChangeOf(now: Rate, before: Rate, days: number): string {
  if (before.rate === null) return copy.overview.noneBefore(days);
  if (now.rate === null) return copy.overview.sameAs(pct(before.rate));
  const delta = Math.round((now.rate - before.rate) * 1000) / 10;
  if (delta === 0) return copy.overview.sameAs(pct(before.rate));
  return copy.overview.pointsFrom(copy.common.signed(delta, 1), pct(before.rate));
}

/** The last days against the days before them: four figures, each with its change in words and a plain sign. */
function Recent({ data }: { data: TeamOverviewResponse }) {
  const { days, last, previous } = data.recent;
  const finish = last.people;
  const stats = [
    { label: copy.overview.checksStarted, value: String(last.sessions.of), sub: null, change: changeOf(last.sessions.of, previous.sessions.of, days), small: false },
    { label: copy.overview.checksCompleted, value: String(last.sessions.count), sub: null, change: changeOf(last.sessions.count, previous.sessions.count, days), small: false },
    { label: copy.overview.peopleCompleted, value: String(last.people.count), sub: null, change: changeOf(last.people.count, previous.people.count, days), small: false },
    {
      label: copy.overview.finishRate,
      value: finish.rate === null ? copy.common.noData : pct(finish.rate),
      sub: finish.of > 0 ? copy.overview.ofPeople(finish.count, finish.of) : null,
      change: rateChangeOf(finish, previous.people, days),
      small: finish.of > 0 && finish.of < SMALL_N,
    },
  ];
  return (
    <div className={styles.recent}>
      <div className={styles.recentHead}>
        <h3 className={styles.subTitle}>{copy.overview.recentTitle(days)}</h3>
        <p className={styles.footnoteTight}>{copy.overview.recentLead(days)}</p>
      </div>
      <dl className={styles.recentGrid}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.recentStat}>
            <dt className={styles.recentLabel}>{stat.label}</dt>
            <dd className={cx(styles.recentValue, stat.small && styles.dim)}>{stat.value}</dd>
            {stat.sub && <dd className={styles.recentSub}>{stat.sub}</dd>}
            <dd className={styles.recentChange}>{stat.change}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Overview({ data }: { data: TeamOverviewResponse }) {
  const { sessions, people } = data.totals;
  const anySmall = [sessions.of, people.of, ...data.byRole.flatMap((r) => [r.sessions.of, r.people.of])].some((n) => n > 0 && n < SMALL_N);
  return (
    <>
      <Recent data={data} />
      <h3 className={cx(styles.subTitle, styles.allTime)}>{copy.overview.allTime}</h3>
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
      <SmallNote show={anySmall} />
    </>
  );
}
