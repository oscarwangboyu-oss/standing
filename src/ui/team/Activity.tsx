'use client';

/** Return rates, micro-app participation and how the result page is read. */
import { team as copy } from '@/copy/team';
import type { TeamAppsResponse, TeamDailyResponse, TeamReportResponse, TeamReturnsResponse } from '@/shared/api';
import { formatDay } from '@/ui';
import { Count, RateView, SMALL_N, SmallNote, Status, TableBox, isSmall } from './parts';
import styles from './team.module.css';

/**
 * Return rates by the calendar week of the first check. A week of fewer than SMALL_N people is
 * drawn lighter, with one footnote under the table. The CSV keeps one row per day.
 */
export function Returns({ data }: { data: TeamReturnsResponse }) {
  if (data.weeks.length <= 1 && data.weeks[0]?.people === 0) return <p className={styles.panel}>{copy.common.noRows}</p>;
  const anySmall = data.weeks.some((w) => w.people < SMALL_N || w.returns.some(isSmall));
  return (
    <>
    <TableBox caption={copy.returns.caption}>
      <thead>
        <tr>
          <th scope="col">{copy.returns.firstDay}</th>
          <th scope="col" className={styles.numCol}>
            {copy.returns.people}
          </th>
          {data.returnDays.map((day) => (
            <th key={day} scope="col">
              {copy.returns.day(day)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((row) => (
          <tr key={row.weekStart} className={row.weekStart === 'all' ? styles.totalRow : row.people < SMALL_N ? styles.dimRow : undefined}>
            <th scope="row">{row.weekStart === 'all' ? copy.returns.all : formatDay(row.weekStart)}</th>
            <td className={styles.numCol}>
              <Count n={row.people} />
            </td>
            {data.returnDays.map((day) => {
              const found = row.returns.find((r) => r.day === day);
              return <td key={day}>{found ? <RateView rate={found} /> : <span className={styles.none}>{copy.common.noData}</span>}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </TableBox>
    <SmallNote show={anySmall}>{copy.returns.csvNote}</SmallNote>
    </>
  );
}

export function AppsSummary({ data }: { data: TeamAppsResponse }) {
  const anySmall = data.summary.some((row) => isSmall(row.participated) || (row.active > 0 && row.active < SMALL_N));
  return (
    <>
    <TableBox caption={copy.apps.summaryCaption}>
      <thead>
        <tr>
          <th scope="col">{copy.apps.app}</th>
          <th scope="col">{copy.apps.flag}</th>
          <th scope="col">{copy.apps.window}</th>
          <th scope="col" className={styles.numCol}>
            {copy.apps.active}
          </th>
          <th scope="col">{copy.apps.participated}</th>
          <th scope="col" className={styles.numCol}>
            {copy.apps.entries}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.summary.map((row) => (
          <tr key={row.app}>
            <th scope="row">{copy.apps.names[row.app]}</th>
            <td>
              <Status kind={row.enabled ? 'met' : 'none'}>{row.enabled ? copy.common.on : copy.common.off}</Status>
            </td>
            <td>{copy.apps.days(row.windowDays)}</td>
            <td className={styles.numCol}>
              <Count n={row.active} />
            </td>
            <td>
              <RateView rate={row.participated} />
            </td>
            <td className={styles.numCol}>{row.entries}</td>
          </tr>
        ))}
      </tbody>
    </TableBox>
    <SmallNote show={anySmall} />
    </>
  );
}

export function AppsWeeks({ data }: { data: TeamAppsResponse }) {
  if (data.weeks.length === 0) return <p className={styles.panel}>{copy.common.noRows}</p>;
  const anySmall = data.weeks.some((row) => row.active < SMALL_N);
  return (
    <>
    <TableBox caption={copy.apps.weeksCaption}>
      <thead>
        <tr>
          <th scope="col">{copy.apps.week}</th>
          <th scope="col" className={styles.numCol}>
            {copy.apps.active}
          </th>
          <th scope="col">{copy.apps.names.weekly_win}</th>
          <th scope="col">{copy.apps.names.people_nudge}</th>
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((row) => (
          <tr key={row.weekStart}>
            <th scope="row">{formatDay(row.weekStart)}</th>
            <td className={styles.numCol}>
              <Count n={row.active} />
            </td>
            <td>
              <RateView rate={row.weeklyWin} />
            </td>
            <td>
              <RateView rate={row.peopleNudge} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableBox>
    <SmallNote show={anySmall} />
    </>
  );
}

/** The daily open week by week, in person-days. A week of fewer than SMALL_N person-days is drawn lighter. */
export function Daily({ data }: { data: TeamDailyResponse }) {
  if (data.weeks.length <= 1 && data.weeks[0]?.active === 0) return <p className={styles.panel}>{copy.common.noRows}</p>;
  const anySmall = data.weeks.some((row) => row.active < SMALL_N || isSmall(row.dailyOpen));
  return (
    <>
    <TableBox caption={copy.apps.dailyCaption}>
      <thead>
        <tr>
          <th scope="col">{copy.apps.weekCol}</th>
          <th scope="col" className={styles.numCol}>
            {copy.apps.people}
          </th>
          <th scope="col" className={styles.numCol}>
            {copy.apps.personDays}
          </th>
          <th scope="col">{copy.apps.names.daily_open}</th>
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((row) => (
          <tr key={row.weekStart} className={row.weekStart === 'all' ? styles.totalRow : row.active < SMALL_N ? styles.dimRow : undefined}>
            <th scope="row">{row.weekStart === 'all' ? copy.apps.allWeeks : formatDay(row.weekStart)}</th>
            <td className={styles.numCol}>
              <Count n={row.people} />
            </td>
            <td className={styles.numCol}>
              <Count n={row.active} />
            </td>
            <td>
              <RateView rate={row.dailyOpen} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableBox>
    <SmallNote show={anySmall}>{copy.apps.dailyCsvNote}</SmallNote>
    </>
  );
}

export function Report({ data }: { data: TeamReportResponse }) {
  if (data.rows.length === 0) return <p className={styles.panel}>{copy.common.noRows}</p>;
  return (
    <TableBox caption={copy.report.caption}>
      <thead>
        <tr>
          <th scope="col">{copy.report.section}</th>
          <th scope="col" className={styles.numCol}>
            {copy.report.seen}
          </th>
          <th scope="col" className={styles.numCol}>
            {copy.report.dwell}
          </th>
          <th scope="col" className={styles.numCol}>
            {copy.report.shares}
          </th>
          <th scope="col">{copy.report.useful}</th>
          <th scope="col" className={styles.numCol}>
            {copy.report.notUseful}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => {
          const votes = row.useful + row.notUseful;
          return (
            <tr key={row.section}>
              <th scope="row">{copy.report.sections[row.section]}</th>
              <td className={styles.numCol}>
                <Count n={row.seen} />
              </td>
              <td className={styles.numCol}>
                {row.medianDwellMs === null ? <span className={styles.none}>{copy.common.noData}</span> : copy.items.seconds((row.medianDwellMs / 1000).toFixed(1))}
              </td>
              <td className={styles.numCol}>{row.shares}</td>
              <td>
                <RateView rate={{ count: row.useful, of: votes, rate: votes > 0 ? row.useful / votes : null }} />
              </td>
              <td className={styles.numCol}>{row.notUseful}</td>
            </tr>
          );
        })}
      </tbody>
    </TableBox>
  );
}
