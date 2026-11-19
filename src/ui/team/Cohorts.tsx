'use client';

/** Sector price distributions per cohort, and the internal values the team reads before setting real norms. */
import { useMemo, useState } from 'react';
import { team as copy } from '@/copy/team';
import type { AreaId, RoleId } from '@/engine';
import type { TeamNormRow, TeamNormsResponse, TeamPriceRow, TeamPricesResponse } from '@/shared/api';
import { AREA_CODE, SectorTag, Tag, formatPrice, sectorName, sectorStyle, cx } from '@/ui';
import { DISPLAY_AREAS, ROLE_IDS, ageLabel, bankOf, cohortLabel, roleLabel } from './labels';
import { Count, MIN_COHORT, SMALL_N, Select, TableBox, num } from './parts';
import styles from './team.module.css';

const ALL = 'all';
const roleOf = (value: string): RoleId | null => (value === ALL ? null : (value as RoleId));
const ageOf = (value: string): number | null => (value === ALL ? null : Number(value));

function useCohortOptions() {
  return useMemo(() => {
    const bank = bankOf();
    return {
      bank,
      roles: [{ value: ALL, label: copy.common.allRoles }, ...ROLE_IDS.map((id) => ({ value: id as string, label: roleLabel(id) }))],
      ages: [{ value: ALL, label: copy.common.allAges }, ...bank.ages.map((_, i) => ({ value: String(i), label: ageLabel(i, bank) }))],
    };
  }, []);
}

// ---------------------------------------------------------------- prices

const W = 300;
const H = 96;
const PAD = { top: 16, bottom: 18, side: 4 };

/** People per price band as columns, with the count on each column and the 100 line drawn. */
function Histogram({ row, edges }: { row: TeamPriceRow; edges: number[] }) {
  const code = AREA_CODE[row.area];
  const top = Math.max(...row.bins, 1);
  const inner = W - 2 * PAD.side;
  const band = inner / row.bins.length;
  const floor = H - PAD.bottom;
  const tall = floor - PAD.top;
  const x = (price: number) => PAD.side + ((price - edges[0]) / (edges[edges.length - 1] - edges[0])) * inner;
  const parts = row.bins.map((count, i) => copy.prices.bin(edges[i], edges[i + 1], count));
  return (
    <svg className={styles.histogram} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.prices.chart(sectorName(code), row.n, parts)}>
      {row.bins.map((count, i) => {
        const h = count === 0 ? 0 : Math.max(2, (count / top) * tall);
        const bx = PAD.side + i * band + 2;
        return (
          <g key={i}>
            <rect className={styles.histTrack} x={bx} y={PAD.top} width={band - 4} height={tall} rx={4} />
            {count > 0 && <rect className={styles.histBar} x={bx} y={floor - h} width={band - 4} height={h} rx={4} />}
            <text className={styles.histCount} x={bx + (band - 4) / 2} y={Math.max(11, floor - h - 4)} textAnchor="middle">
              {count}
            </text>
          </g>
        );
      })}
      <line className={styles.histIssue} x1={x(100)} x2={x(100)} y1={2} y2={floor + 2} />
      {edges.map((edge, i) => (
        <text key={edge} className={cx(styles.histEdge, edge === 100 && styles.histEdgeIssue)} x={x(edge)} y={H - 4} textAnchor={i === 0 ? 'start' : i === edges.length - 1 ? 'end' : 'middle'}>
          {edge}
        </text>
      ))}
    </svg>
  );
}

export function Prices({ data }: { data: TeamPricesResponse }) {
  const options = useCohortOptions();
  const [role, setRole] = useState(ALL);
  const [age, setAge] = useState(ALL);
  const rows = data.rows.filter((r) => r.role === roleOf(role) && r.age === ageOf(age));
  const byArea = new Map<AreaId, TeamPriceRow>(rows.map((r) => [r.area, r]));

  return (
    <>
      <div className={styles.filterLine}>
        <div className={styles.filters}>
          <Select label={copy.common.role} value={role} onChange={setRole} options={options.roles} />
          <Select label={copy.common.age} value={age} onChange={setAge} options={options.ages} />
        </div>
        <p className={styles.summary}>{cohortLabel(roleOf(role), ageOf(age), options.bank)}</p>
      </div>
      {rows.length === 0 ? (
        <p className={styles.panel}>{copy.prices.empty}</p>
      ) : (
        <ul className={styles.priceRows}>
          {DISPLAY_AREAS.map((area) => {
            const row = byArea.get(area);
            const code = AREA_CODE[area];
            return (
              <li key={area} className={styles.priceRow} style={sectorStyle(code)}>
                <div className={styles.priceName}>
                  <SectorTag code={code} name />
                </div>
                {row && row.n < MIN_COHORT ? (
                  <>
                    <dl className={styles.priceFigures}>
                      <div>
                        <dt>{copy.prices.n}</dt>
                        <dd>
                          <Count n={row.n} />
                        </dd>
                      </div>
                    </dl>
                    <p className={styles.heldBack}>{copy.common.heldBack(MIN_COHORT)}</p>
                  </>
                ) : row ? (
                  <>
                    <dl className={styles.priceFigures}>
                      <div>
                        <dt>{copy.prices.n}</dt>
                        <dd>
                          <Count n={row.n} />
                        </dd>
                      </div>
                      <div>
                        <dt>{copy.prices.median}</dt>
                        <dd>{formatPrice(row.median)}</dd>
                      </div>
                      <div>
                        <dt>{copy.prices.min}</dt>
                        <dd>{formatPrice(row.min)}</dd>
                      </div>
                      <div>
                        <dt>{copy.prices.max}</dt>
                        <dd>{formatPrice(row.max)}</dd>
                      </div>
                    </dl>
                    <Histogram row={row} edges={data.binEdges} />
                  </>
                ) : (
                  <p className={cx(styles.none, styles.priceEmpty)}>{copy.common.noData}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------- norms

type By = 'role' | 'age';

export function Norms({ data }: { data: TeamNormsResponse }) {
  const options = useCohortOptions();
  const [by, setBy] = useState<By>('role');
  const [within, setWithin] = useState(ALL);

  const changeBy = (value: string) => {
    setBy(value as By);
    setWithin(ALL);
  };

  // Rows compare roles within one age band (or all ages), or age bands within one role (or all roles).
  const cohorts: Array<{ role: RoleId | null; age: number | null }> =
    by === 'role'
      ? [null, ...ROLE_IDS].map((role) => ({ role, age: ageOf(within) }))
      : [null, ...options.bank.ages.map((_, i) => i)].map((age) => ({ role: roleOf(within), age }));

  const key = (role: RoleId | null, age: number | null, area: AreaId) => `${role ?? ALL}|${age ?? ALL}|${area}`;
  const index = useMemo(() => new Map<string, TeamNormRow>(data.rows.map((r) => [key(r.role, r.age, r.area), r])), [data.rows]);

  return (
    <>
      <div className={styles.filterLine}>
        <div className={styles.filters}>
          <Select
            label={copy.norms.compare}
            value={by}
            onChange={changeBy}
            options={[
              { value: 'role', label: copy.norms.byRole },
              { value: 'age', label: copy.norms.byAge },
            ]}
          />
          <Select label={copy.norms.within} value={within} onChange={setWithin} options={by === 'role' ? options.ages : options.roles} />
        </div>
        <p className={styles.summary}>
          {copy.norms.inForce(data.current.version)} {data.current.provisional && <Tag>{copy.norms.provisional}</Tag>}
        </p>
      </div>
      <TableBox caption={copy.norms.caption} className={styles.normsTable}>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>
              {copy.norms.cohort}
            </th>
            {DISPLAY_AREAS.map((area) => (
              <th key={area} scope="colgroup" colSpan={3} className={styles.groupCol}>
                <SectorTag code={AREA_CODE[area]} size="sm" />
              </th>
            ))}
          </tr>
          <tr>
            {DISPLAY_AREAS.flatMap((area) => [
              <th key={`${area}-m`} scope="col" className={cx(styles.numCol, styles.groupStart)}>
                {copy.norms.median}
              </th>,
              <th key={`${area}-s`} scope="col" className={styles.numCol}>
                {copy.norms.sd}
              </th>,
              <th key={`${area}-n`} scope="col" className={styles.numCol}>
                {copy.norms.n}
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          <tr className={styles.currentRow}>
            <th scope="row">{copy.norms.current}</th>
            {DISPLAY_AREAS.flatMap((area) => [
              <td key={`${area}-m`} className={cx(styles.numCol, styles.groupStart)}>
                {num(data.current.sectors[area].median, 2)}
              </td>,
              <td key={`${area}-s`} className={styles.numCol}>
                {num(data.current.sectors[area].sd, 2)}
              </td>,
              <td key={`${area}-n`} className={styles.numCol} />,
            ])}
          </tr>
          {cohorts.map(({ role, age }) => (
            <tr key={`${role ?? ALL}|${age ?? ALL}`}>
              <th scope="row">{cohortLabel(role, age, options.bank)}</th>
              {DISPLAY_AREAS.flatMap((area) => {
                const row = index.get(key(role, age, area));
                const small = !row || row.n < SMALL_N;
                const held = !row || row.n < MIN_COHORT;
                return [
                  <td key={`${area}-m`} className={cx(styles.numCol, styles.groupStart, small && styles.dim)}>
                    {held ? '' : num(row.median, 3)}
                  </td>,
                  <td key={`${area}-s`} className={cx(styles.numCol, small && styles.dim)}>
                    {held || row.sd === null ? '' : num(row.sd, 3)}
                  </td>,
                  <td key={`${area}-n`} className={cx(styles.numCol, small && styles.nSmall)}>
                    {row ? row.n : 0}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </TableBox>
      <p className={styles.footnote}>{copy.norms.smallNote(SMALL_N, MIN_COHORT)}</p>
    </>
  );
}
