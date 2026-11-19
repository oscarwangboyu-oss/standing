'use client';

/** The per-question table: one row per question version, with every red line marked by a word. */
import { useId, useMemo, useState } from 'react';
import { team as copy } from '@/copy/team';
import type { TeamItemRow, TeamItemsResponse } from '@/shared/api';
import { SectorTag, Tag, cx } from '@/ui';
import { bankOf, questionOf, sectorOf } from './labels';
import { Count, Flag, RateView, TableBox, line, pct } from './parts';
import styles from './team.module.css';

const isRed = (row: TeamItemRow): boolean =>
  row.skip.red || row.dropOff.red || row.time.red || row.options.red || row.notApplicable.red || row.retest.red;

/** Each option as a column whose height is its share, with the shares printed under it. */
function Spread({ row, labels }: { row: TeamItemRow; labels: string[] | null }) {
  const { counts, shares } = row.options;
  if (row.answered === 0) return <span className={styles.none}>{copy.common.noData}</span>;
  const top = Math.max(...shares.map((s) => s ?? 0), 0.0001);
  return (
    <div className={styles.spread}>
      <ol className={styles.spreadBars}>
        {shares.map((share, i) => {
          const text = copy.items.optionLabel(i + 1, labels?.[i] ?? '', pct(share, 0), counts[i] ?? 0);
          return (
            <li key={i} className={styles.spreadItem} title={text}>
              <span className={styles.spreadColumn} aria-hidden="true">
                <span className={styles.spreadFill} style={{ height: `${Math.max(4, ((share ?? 0) / top) * 100)}%` }} />
              </span>
              <span className={styles.spreadShare} aria-hidden="true">
                {Math.round((share ?? 0) * 100)}
              </span>
              <span className="vh">{text}</span>
            </li>
          );
        })}
      </ol>
      <span className={styles.cellSub}>{copy.items.answered(row.answered)}</span>
      {row.options.red && <Flag>{copy.items.red.options}</Flag>}
    </div>
  );
}

export interface ItemsProps {
  data: TeamItemsResponse;
}

export function Items({ data }: ItemsProps) {
  const [onlyRed, setOnlyRed] = useState(false);
  const checkId = useId();
  const bank = useMemo(() => bankOf(data.bankVersion), [data.bankVersion]);
  const lines = data.redLines;
  const red = data.rows.filter(isRed).length;
  const rows = onlyRed ? data.rows.filter(isRed) : data.rows;

  return (
    <>
      <div className={styles.filterLine}>
        <p className={styles.summary}>{copy.items.summary(data.rows.length, red)}</p>
        <label className={styles.check} htmlFor={checkId}>
          <input id={checkId} type="checkbox" className={styles.checkbox} checked={onlyRed} onChange={(event) => setOnlyRed(event.target.checked)} />
          <span>{copy.items.onlyRed}</span>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className={styles.panel}>{copy.common.noRows}</p>
      ) : (
        <TableBox caption={copy.items.caption} className={styles.itemsTable} tall>
          <thead>
            <tr>
              <th scope="col" className={styles.questionCol}>
                {copy.items.question}
              </th>
              <th scope="col" className={styles.numCol}>
                {copy.items.shown}
              </th>
              <th scope="col">{copy.items.skip}</th>
              <th scope="col">{copy.items.dropOff}</th>
              <th scope="col">{copy.items.time}</th>
              <th scope="col">{copy.items.options}</th>
              <th scope="col">{copy.items.notApplicable}</th>
              <th scope="col">{copy.items.retest}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const question = questionOf(bank, row.itemId, row.versionKey);
              const sector = sectorOf(row.area);
              const na = row.notApplicable;
              return (
                <tr key={`${row.itemId}/${row.versionKey}`}>
                  <th scope="row" className={styles.questionCol}>
                    <span className={styles.questionHead}>
                      <span className={styles.questionId}>
                        {row.itemId}/{row.versionKey}
                      </span>
                      {sector ? <SectorTag code={sector} size="sm" /> : <Tag>{copy.common.ladder}</Tag>}
                    </span>
                    <span className={styles.stem}>{question?.stem ?? copy.items.stemMissing}</span>
                  </th>
                  <td className={styles.numCol}>
                    <Count n={row.shown} />
                  </td>
                  <td className={cx(row.skip.red && styles.redCell)}>
                    <RateView rate={row.skip} flag={row.skip.red ? copy.items.red.skip(line(lines.skipRate)) : null} />
                  </td>
                  <td className={cx(row.dropOff.red && styles.redCell)}>
                    <RateView rate={row.dropOff} flag={row.dropOff.red ? copy.items.red.dropOff(line(lines.dropOffRate)) : null} />
                  </td>
                  <td className={cx(row.time.red && styles.redCell)}>
                    {row.time.medianSeconds === null ? (
                      <span className={styles.none}>{copy.common.noData}</span>
                    ) : (
                      <span className={styles.rate}>
                        <span className={styles.rateMain}>{copy.items.seconds(row.time.medianSeconds.toFixed(1))}</span>
                        <span className={styles.rateSub}>
                          {row.time.similarMedianSeconds === null
                            ? copy.items.noSimilar(row.time.similarCount)
                            : copy.items.similar(row.time.similarMedianSeconds.toFixed(1), row.time.similarCount)}
                        </span>
                        {row.time.red && <Flag>{copy.items.red.time(lines.timeVsSimilarStems)}</Flag>}
                      </span>
                    )}
                  </td>
                  <td className={cx(row.options.red && styles.redCell)}>
                    <Spread row={row} labels={question?.options ?? null} />
                  </td>
                  <td className={cx(na.red && styles.redCell)}>
                    <RateView rate={na} flag={na.red ? copy.items.red.notApplicable(line(lines.notApplicableRate)) : null} />
                    {na.count > 0 && <span className={styles.cellSub}>{copy.items.naSplit(na.marked, na.unscoredOption)}</span>}
                  </td>
                  <td className={cx(row.retest.red && styles.redCell)}>
                    <RateView rate={row.retest} flag={row.retest.red ? copy.items.red.retest(line(lines.retestChangeRate)) : null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
      <details className={styles.details}>
        <summary className={styles.detailsSummary}>{copy.items.linesTitle}</summary>
        <ul className={styles.detailsList}>
          {copy.items
            .lines({
              skip: line(lines.skipRate),
              dropOff: line(lines.dropOffRate),
              times: lines.timeVsSimilarStems,
              max: line(lines.optionShareMax),
              min: line(lines.optionShareMin),
              na: line(lines.notApplicableRate),
              retest: line(lines.retestChangeRate),
            })
            .map((text) => (
              <li key={text}>{text}</li>
            ))}
          <li>
            {copy.items.definitions({
              idle: data.definitions.dropOffIdleMinutes,
              band: data.definitions.similarStemBand,
              minSimilar: data.definitions.minSimilarStems,
              min: data.definitions.retestWindowDays.min,
              max: data.definitions.retestWindowDays.max,
            })}
          </li>
        </ul>
      </details>
    </>
  );
}
