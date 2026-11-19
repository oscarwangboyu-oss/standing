'use client';

/** The seven scoring tests: a verdict in words, the count behind it and its numbers next to the thresholds. */
import type { ReactNode } from 'react';
import { team as copy } from '@/copy/team';
import type { TeamTestsResponse } from '@/shared/api';
import { AREA_CODE, cx } from '@/ui';
import type { AreaId } from '@/engine';
import { roleLabelOf } from './labels';
import { MIN_COHORT, Status, TableBox, line, num, pct, type StatusKind } from './parts';
import styles from './team.module.css';

type Verdict = 'pass' | 'warn' | 'insufficient_data';

const KIND: Record<Verdict, StatusKind> = { pass: 'met', warn: 'not_met', insufficient_data: 'none' };

interface Figure {
  label: string;
  value: string;
  /** The threshold the value is judged against, in words. */
  line?: string;
}

interface TestView {
  id: keyof typeof copy.tests.names;
  verdict: Verdict;
  reasons: string[];
  n: number;
  figures: Figure[];
  extra?: ReactNode;
}

/** "C-W" to "SKIL and WLTH". */
function pairName(key: string): string {
  return key
    .split('-')
    .map((area) => (area in AREA_CODE ? AREA_CODE[area as AreaId] : area))
    .join(' / ');
}

function viewsOf(data: TeamTestsResponse): TestView[] {
  const r = data.results;
  const t = data.thresholds;
  const L = copy.tests.labels;
  const points = (v: number | null, digits = 2) => (v === null ? copy.common.noData : copy.tests.points(v.toFixed(digits)));
  const top = Object.entries(r.validity.sectorCorrelations)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort((a, b) => b[1] - a[1])[0];

  const groups = [...r.fairness.byRole.map((g) => ({ ...g, group: roleLabelOf(g.group) })), ...r.fairness.byAge];

  return [
    {
      id: 'range',
      ...r.range,
      figures: [
        { label: L.sd, value: points(r.range.overall.sd), line: copy.tests.atLeast(String(t.range.minOverallSd)) },
        { label: L.median, value: num(r.range.overall.median) },
        { label: L.p5p95, value: copy.tests.between(num(r.range.overall.p5), num(r.range.overall.p95)) },
        { label: L.minMax, value: copy.tests.between(num(r.range.overall.min), num(r.range.overall.max)) },
        { label: L.limitDown, value: pct(r.range.shareAtLimitDown), line: copy.tests.atMostTogether(line(t.range.maxShareAtLimits)) },
        { label: L.limitUp, value: pct(r.range.shareAtLimitUp) },
        { label: L.sectorPrices, value: String(r.range.sectorPrices) },
      ],
    },
    {
      id: 'stability',
      ...r.stability,
      figures: [
        { label: L.correlation, value: num(r.stability.correlation), line: copy.tests.atLeast(t.stability.minRetestCorrelation.toFixed(2)) },
        { label: L.meanAbs, value: points(r.stability.meanAbsoluteChange) },
      ],
    },
    {
      id: 'response',
      ...r.response,
      figures: [
        { label: L.changedAnswers, value: String(r.response.changedAnswers) },
        {
          label: L.perAnswer,
          value: points(r.response.pointsPerChangedAnswer, 3),
          line: copy.tests.between(String(t.response.minPointsPerChangedAnswer), String(t.response.maxPointsPerChangedAnswer)),
        },
        { label: L.unmoved, value: pct(r.response.shareUnmoved) },
      ],
    },
    {
      id: 'validity',
      ...r.validity,
      figures: [
        { label: L.ladder, value: num(r.validity.ladderCorrelation), line: copy.tests.atLeast(t.validity.minLadderCorrelation.toFixed(2)) },
        { label: L.ladderRecords, value: String(r.validity.ladderRecords) },
        {
          label: L.highestSector,
          value: top ? `${num(top[1])} (${pairName(top[0])})` : num(r.validity.highestSectorCorrelation),
          line: copy.tests.atMost(t.validity.maxSectorCorrelation.toFixed(2)),
        },
      ],
    },
    {
      id: 'fairness',
      ...r.fairness,
      figures: [
        { label: L.roleGap, value: points(r.fairness.largestRoleGap), line: copy.tests.atMost(String(t.fairness.maxMedianGap)) },
        { label: L.ageGap, value: points(r.fairness.largestAgeGap), line: copy.tests.atMost(String(t.fairness.maxMedianGap)) },
      ],
      extra:
        groups.length > 0 ? (
          <details className={styles.details}>
            <summary className={styles.detailsSummary}>{copy.tests.groups}</summary>
            <TableBox caption={copy.tests.groupsCaption} className={styles.gapTop}>
              <thead>
                <tr>
                  <th scope="col">{copy.tests.group}</th>
                  <th scope="col" className={styles.numCol}>
                    {copy.norms.n}
                  </th>
                  <th scope="col" className={styles.numCol}>
                    {copy.tests.groupMedian}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.group}>
                    <th scope="row">{g.group}</th>
                    <td className={cx(styles.numCol, !g.counted && styles.nSmall)}>{g.n}</td>
                    <td className={styles.numCol}>
                      {g.n < MIN_COHORT ? <span className={styles.none}>{copy.common.heldBackShort}</span> : num(g.median)}
                      {!g.counted && <span className={styles.cellSub}>{copy.tests.notCounted}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </details>
        ) : undefined,
    },
    {
      id: 'gaming',
      ...r.gaming,
      figures: [
        { label: L.allBest, value: pct(r.gaming.allBestShare), line: copy.tests.atMost(line(t.gaming.maxAllBestShare)) },
        { label: L.fast, value: pct(r.gaming.fastShare), line: copy.tests.atMost(line(t.gaming.maxFastShare)) },
        { label: L.gradeC, value: pct(r.gaming.gradeCShare), line: copy.tests.atMost(line(t.gaming.maxGradeCShare)) },
      ],
    },
    {
      id: 'versionEffect',
      ...r.versionEffect,
      figures: [
        { label: L.rank, value: num(r.versionEffect.rankCorrelation), line: copy.tests.atLeast(t.versionEffect.minRankCorrelation.toFixed(2)) },
        { label: L.moved, value: pct(r.versionEffect.shareMoved), line: copy.tests.atMost(line(t.versionEffect.maxShareMoved)) },
        { label: L.meanShift, value: points(r.versionEffect.meanShift) },
        { label: L.largestMove, value: points(r.versionEffect.largestMove) },
      ],
      extra: <p className={styles.cellSub}>{data.versionComparison ?? copy.tests.nothingToCompare}</p>,
    },
  ];
}

export function Tests({ data }: { data: TeamTestsResponse }) {
  const views = viewsOf(data);
  return (
    <>
      <p className={styles.summary}>
        {copy.tests.counts({ checks: data.checks, people: data.people, retest: data.retestPairs, consecutive: data.consecutivePairs, version: data.versionPairs })}{' '}
        {copy.tests.minRecords(data.thresholds.minRecords)}
      </p>
      <ol className={styles.tests}>
        {views.map((test, i) => (
          <li key={test.id} className={styles.test}>
            <div className={styles.testHead}>
              <span className={styles.testIndex} aria-hidden="true">
                {i + 1}
              </span>
              <div className={styles.testText}>
                <h3 className={styles.testName}>{copy.tests.names[test.id]}</h3>
                <p className={styles.testAsk}>{copy.tests.asks[test.id]}</p>
              </div>
              <div className={styles.testVerdict}>
                <Status kind={KIND[test.verdict]}>{copy.tests.verdicts[test.verdict]}</Status>
                <span className={cx(styles.testN, test.n < data.thresholds.minRecords && styles.testNSmall)}>{copy.tests.n(test.n)}</span>
              </div>
            </div>
            {test.reasons.length > 0 && (
              <ul className={styles.reasons}>
                {test.reasons.map((reason) => (
                  <li key={reason}>{copy.tests.reasons[reason] ?? reason}</li>
                ))}
              </ul>
            )}
            <dl className={styles.figures}>
              {test.figures.map((figure) => (
                <div key={figure.label} className={styles.figure}>
                  <dt>{figure.label}</dt>
                  <dd>
                    <span className={cx(styles.figureValue, figure.value === copy.common.noData && styles.none)}>{figure.value}</span>
                    {figure.line && <span className={styles.figureLine}>{figure.line}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {test.extra}
          </li>
        ))}
      </ol>
    </>
  );
}
