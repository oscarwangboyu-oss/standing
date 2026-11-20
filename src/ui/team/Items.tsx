'use client';

/**
 * The per-question table: one row per question version, with every red line marked by a word.
 * Rows with the most breaches come first, and only rows over a red line are shown until the
 * reader asks for all. On a phone each row is a card with the stem and only the lines it is
 * over; the full row is in the CSV.
 */
import { useId, useMemo, useState } from 'react';
import { team as copy } from '@/copy/team';
import type { TeamItemRow, TeamItemsResponse } from '@/shared/api';
import { Button, SectorTag, Tag, cx } from '@/ui';
import { byBreaches, isRed, itemAnchor } from './breaches';
import { bankOf, questionOf, sectorOf } from './labels';
import { Count, Flag, RateView, SmallNote, SMALL_N, TableBox, isSmall, line, pct } from './parts';
import styles from './team.module.css';

/** Rows shown before the reader asks for the rest. The worst come first, so these are the ones to read. */
const FIRST_ROWS = 10;

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
  // On by default whenever something is red: those are the rows to read.
  const [onlyRed, setOnlyRed] = useState(() => data.rows.some(isRed));
  const [all, setAll] = useState(false);
  const checkId = useId();
  const bank = useMemo(() => bankOf(data.bankVersion), [data.bankVersion]);
  const lines = data.redLines;
  const sorted = useMemo(() => byBreaches(data.rows), [data.rows]);
  const red = data.rows.filter(isRed).length;
  const listed = onlyRed ? sorted.filter(isRed) : sorted;
  const rows = all ? listed : listed.slice(0, FIRST_ROWS);
  const anySmall = rows.some(
    (row) => row.shown < SMALL_N || isSmall(row.skip) || isSmall(row.dropOff) || isSmall(row.notApplicable) || isSmall(row.retest),
  );

  return (
    <>
      <div className={styles.filterLine}>
        <p className={styles.summary}>
          {copy.items.summary(data.rows.length, red)} {copy.items.order}
        </p>
        <label className={styles.check} htmlFor={checkId}>
          <input id={checkId} type="checkbox" className={styles.checkbox} checked={onlyRed} onChange={(event) => setOnlyRed(event.target.checked)} />
          <span>{copy.items.onlyRed}</span>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className={styles.panel}>{copy.common.noRows}</p>
      ) : (
        <TableBox caption={copy.items.caption} className={styles.itemsTable}>
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
                <tr key={`${row.itemId}/${row.versionKey}`} id={itemAnchor(row)} className={styles.itemRow}>
                  <th scope="row" className={styles.questionCol}>
                    <span className={styles.questionHead}>
                      <span className={styles.questionId}>
                        {row.itemId}/{row.versionKey}
                      </span>
                      {sector ? <SectorTag code={sector} size="sm" /> : <Tag>{copy.common.ladder}</Tag>}
                    </span>
                    <span className={styles.stem}>{question?.stem ?? copy.items.stemMissing}</span>
                  </th>
                  <td className={styles.numCol} data-label={copy.items.shown}>
                    <Count n={row.shown} />
                  </td>
                  <td className={cx(row.skip.red && styles.redCell)} data-label={copy.items.skip}>
                    <RateView rate={row.skip} flag={row.skip.red ? copy.items.red.skip(line(lines.skipRate)) : null} />
                  </td>
                  <td className={cx(row.dropOff.red && styles.redCell)} data-label={copy.items.dropOff}>
                    <RateView rate={row.dropOff} flag={row.dropOff.red ? copy.items.red.dropOff(line(lines.dropOffRate)) : null} />
                  </td>
                  <td className={cx(row.time.red && styles.redCell)} data-label={copy.items.time}>
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
                  <td className={cx(row.options.red && styles.redCell)} data-label={copy.items.options}>
                    <Spread row={row} labels={question?.options ?? null} />
                  </td>
                  <td className={cx(na.red && styles.redCell)} data-label={copy.items.notApplicable}>
                    <RateView rate={na} flag={na.red ? copy.items.red.notApplicable(line(lines.notApplicableRate)) : null} />
                    {na.count > 0 && <span className={styles.cellSub}>{copy.items.naSplit(na.marked, na.unscoredOption)}</span>}
                  </td>
                  <td className={cx(row.retest.red && styles.redCell)} data-label={copy.items.retest}>
                    <RateView rate={row.retest} flag={row.retest.red ? copy.items.red.retest(line(lines.retestChangeRate)) : null} />
                  </td>
                  {!isRed(row) && <td className={styles.clearCell}>{copy.items.clear}</td>}
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
      {listed.length > FIRST_ROWS && (
        <div className={styles.moreLine}>
          <p className={styles.footnoteTight}>{copy.items.showing(rows.length, listed.length)}</p>
          <Button variant="secondary" size="sm" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? copy.items.showFirst(FIRST_ROWS) : copy.items.showAll(listed.length)}
          </Button>
        </div>
      )}
      <SmallNote show={anySmall} />
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
          <li>{copy.items.minRecords(data.definitions.minRecords)}</li>
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
