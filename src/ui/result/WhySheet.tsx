'use client';

import type { ReactNode } from 'react';
import { BANKS, getBank, type AnswerState, type AreaId, type Bank, type Breakdown, type BreakdownLine, type PriceBreakdown } from '@/engine';
import type { BreakdownResponse } from '@/shared/api';
import { roleNames } from '@/copy/market';
import { why as copy } from '@/copy/result';
import { Button } from '../Button';
import { Change } from '../Change';
import { formatChange, formatDay } from '../format';
import { Price } from '../Price';
import { AREA_CODE } from '../sectors';
import { Sheet } from '../Sheet';
import { SkeletonText } from '../Skeleton';
import { SectorTag, sectorStyle } from '../Tag';
import styles from './result.module.css';

export type WhyTarget = AreaId | 'overall';

export interface WhySheetProps {
  /** The price to explain, or null while the sheet is closed. */
  target: WhyTarget | null;
  onClose: () => void;
  /**
   * first: there is no earlier record. unsaved: the result is not stored yet. Otherwise the
   * state of GET /api/me/breakdown.
   */
  state: 'first' | 'unsaved' | 'loading' | 'error' | 'ready';
  data: BreakdownResponse | null;
  onRetry: () => void;
}

function bankOf(version: string | undefined): Bank {
  return version && Object.hasOwn(BANKS, version) ? (BANKS[version] as Bank) : getBank();
}

/** The words of an answer: the option's own label, "Skipped", or "Not asked". Never a score. */
function answerText(bank: Bank, id: string, state: AnswerState | null): string {
  if (state === null) return copy.notAsked;
  if (state.k === null) return copy.skipped;
  const version = bank.items[id]?.versions.find((v) => v.key === state.key);
  return version?.opts[state.k]?.en ?? copy.skipped;
}

function questionText(bank: Bank, id: string, state: AnswerState | null): string | null {
  if (state === null) return null;
  return bank.items[id]?.versions.find((v) => v.key === state.key)?.q.en ?? null;
}

/** Asked in both checks, in two wordings. The earlier option belongs to the other wording, so it is not shown. */
function otherWording(line: BreakdownLine): boolean {
  return line.before !== null && line.after !== null && line.before.key !== line.after.key;
}

/** Answer lines first, largest first. The line "other" last: it is no single reason. */
export function orderLines(lines: readonly BreakdownLine[]): BreakdownLine[] {
  return [...lines].sort((a, b) => Number(a.kind === 'other') - Number(b.kind === 'other') || Math.abs(b.points) - Math.abs(a.points));
}

/**
 * What the line "other" says when the two checks were taken in another situation or age band:
 * the change, then why part of the move has no single answer. null when both checks share the
 * situation and the age band.
 */
export function situationNote(
  cohorts: Breakdown['cohorts'],
  lines: readonly BreakdownLine[],
  fromBank: Bank,
  toBank: Bank,
): { title: string; detail: string } | null {
  const { before, after } = cohorts;
  const said: string[] = [];
  if (before.role !== after.role) said.push(copy.situation(roleNames[before.role], roleNames[after.role]));
  const fromAge = fromBank.ages[before.age]?.en;
  const toAge = toBank.ages[after.age]?.en;
  if (before.age !== after.age && fromAge && toAge) said.push(copy.ageBand(fromAge, toAge));
  if (said.length === 0) return null;
  const reworded = lines.some((l) => l.kind === 'answer' && (l.before === null || l.after === null || otherWording(l)));
  return { title: said.join(' '), detail: reworded ? copy.reworded : copy.unassigned };
}

function Line({ line, fromBank, toBank, situation }: { line: BreakdownLine; fromBank: Bank; toBank: Bank; situation: { title: string; detail: string } | null }) {
  let title: string;
  let detail: ReactNode = null;
  if (line.kind === 'answer' && line.id) {
    title = questionText(toBank, line.id, line.after) ?? questionText(fromBank, line.id, line.before) ?? line.id;
    const before = otherWording(line) ? copy.askedAnotherWay : answerText(fromBank, line.id, line.before);
    const after = answerText(toBank, line.id, line.after);
    const same = line.before !== null && line.after !== null && line.before.key === line.after.key && line.before.k === line.after.k;
    detail = same ? (
      <span className={styles.whySame}>{copy.sameAnswer}</span>
    ) : (
      <span className={styles.whyAnswers}>
        <span className={styles.whyWhen}>{copy.before}</span>
        <span>{before}</span>
        <span className={styles.whyWhen}>{copy.now}</span>
        <span>{after}</span>
      </span>
    );
  } else if (line.kind === 'extra') {
    title = (line.id && copy.extras[line.id]) || copy.extraFallback;
  } else if (line.kind === 'other' && situation) {
    title = situation.title;
    detail = <span className={styles.whySame}>{situation.detail}</span>;
  } else {
    title = copy.kinds[line.kind === 'version' ? 'version' : 'other'];
  }
  const source = line.kind === 'answer' && line.source ? copy.sources[line.source] : null;
  return (
    <li className={styles.whyLine}>
      <div className={styles.whyText}>
        <p className={styles.whyQuestion}>{title}</p>
        {detail}
        {source && <p className={styles.whySource}>{source}</p>}
      </div>
      <Change value={line.points} size="sm" />
    </li>
  );
}

function Body({ target, price, data }: { target: WhyTarget; price: PriceBreakdown; data: BreakdownResponse }) {
  const fromBank = bankOf(data.from?.versions.bank);
  const toBank = bankOf(data.to?.versions.bank);
  const lines = orderLines(price.lines);
  const situation = data.breakdown ? situationNote(data.breakdown.cohorts, lines, fromBank, toBank) : null;
  return (
    <div className={styles.why} style={target === 'overall' ? undefined : sectorStyle(AREA_CODE[target])}>
      <div className={styles.whyHead}>
        {target === 'overall' ? <span className={styles.whyOverall}>{copy.overall}</span> : <SectorTag code={AREA_CODE[target]} name />}
        {price.delta !== null && <Change value={price.delta} size="md" />}
      </div>
      <dl className={styles.whyEnds}>
        <div>
          <dt>{copy.before}</dt>
          <dd>{price.before === null ? copy.noPrice : <Price value={price.before} size="md" />}</dd>
        </div>
        <div>
          <dt>{copy.now}</dt>
          <dd>{price.after === null ? copy.noPrice : <Price value={price.after} size="md" />}</dd>
        </div>
      </dl>
      {data.from && data.to && formatDay(data.from.at) !== formatDay(data.to.at) && (
        <p className={styles.whyNote}>{copy.between(formatDay(data.from.at), formatDay(data.to.at))}</p>
      )}
      {price.delta === null ? (
        <p className={styles.whyNote}>{copy.noDelta}</p>
      ) : lines.length === 0 ? (
        <p className={styles.whyNote}>{copy.noLines}</p>
      ) : (
        <>
          <ul className={styles.whyLines} aria-label={copy.answersLabel}>
            {lines.map((line, index) => (
              <Line key={`${line.kind}:${line.id ?? index}`} line={line} fromBank={fromBank} toBank={toBank} situation={situation} />
            ))}
          </ul>
          <p className={styles.whySum}>{copy.sum(formatChange(price.delta))}</p>
        </>
      )}
    </div>
  );
}

/**
 * "Why it moved": the answers that changed between this check and the one before it, and the
 * points each added to one price. The lines add up to the change of that price.
 */
export function WhySheet({ target, onClose, state, data, onRetry }: WhySheetProps) {
  const breakdown = data?.breakdown ?? null;
  const price = target && breakdown ? (target === 'overall' ? breakdown.overall : breakdown.sectors[target]) : null;
  return (
    <Sheet open={target !== null} onClose={onClose} title={target && target !== 'overall' ? copy.titleFor(AREA_CODE[target]) : copy.title}>
      {target === null ? null : state === 'first' ? (
        <p className={styles.whyNote}>{copy.first}</p>
      ) : state === 'unsaved' ? (
        <p className={styles.whyNote}>{copy.notSaved}</p>
      ) : state === 'loading' ? (
        <>
          <span className="vh">{copy.loading}</span>
          <SkeletonText lines={4} />
        </>
      ) : state === 'error' ? (
        <div className={styles.whyError}>
          <p className={styles.whyNote}>{copy.failed}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {copy.retry}
          </Button>
        </div>
      ) : price && data ? (
        <Body target={target} price={price} data={data} />
      ) : (
        <p className={styles.whyNote}>{copy.first}</p>
      )}
    </Sheet>
  );
}
