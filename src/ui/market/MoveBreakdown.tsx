import type { ReactNode } from 'react';
import { moved as copy, roleNames } from '@/copy/market';
import { getBank, type AnswerState, type AreaId, type Breakdown, type BreakdownLine, type PriceBreakdown } from '@/engine';
import type { DayBreakdownResponse } from '@/shared/api';
import { Button } from '../Button';
import { Change } from '../Change';
import { cx } from '../cx';
import { formatDay, formatPrice, round2 } from '../format';
import { Skeleton, SkeletonText } from '../Skeleton';
import { SectorTag, Tag, sectorStyle } from '../Tag';
import { codeOf } from './live';
import styles from './market.module.css';

/** The text of a question as the person saw it, and the label of an option of it. */
function questionOf(id: string, state: AnswerState | null): { text: string | null; option: (k: number | null) => string } {
  const item = getBank().items[id];
  const version = item?.versions.find((v) => v.key === state?.key) ?? item?.versions[0];
  return {
    text: version?.q.en ?? null,
    option: (k) => (k === null ? copy.skipped : (version?.opts[k]?.en ?? copy.skipped)),
  };
}

/** Asked on both days, in two wordings. The earlier option belongs to the other wording, so it is not shown. */
function otherWording(line: BreakdownLine): boolean {
  return line.before !== null && line.after !== null && line.before.key !== line.after.key;
}

/** Answer and record lines first, largest first. The line "other" last: it is no single reason. */
export function orderLines(lines: readonly BreakdownLine[]): BreakdownLine[] {
  return [...lines].sort((a, b) => Number(a.kind === 'other') - Number(b.kind === 'other') || Math.abs(b.points) - Math.abs(a.points));
}

interface Situation {
  title: string;
  detail: string;
}

/**
 * What the line "other" says when the full checks behind the two days were taken in another
 * situation or age band. null when they share both.
 */
export function situationNote(cohorts: Breakdown['cohorts'], lines: readonly BreakdownLine[]): Situation | null {
  const { before, after } = cohorts;
  const ages = getBank().ages;
  const said: string[] = [];
  if (before.role !== after.role) said.push(copy.situation(roleNames[before.role], roleNames[after.role]));
  const fromAge = ages[before.age]?.en;
  const toAge = ages[after.age]?.en;
  if (before.age !== after.age && fromAge && toAge) said.push(copy.ageBand(fromAge, toAge));
  if (said.length === 0) return null;
  const reworded = lines.some((l) => l.kind === 'answer' && (l.before === null || l.after === null || otherWording(l)));
  return { title: said.join(' '), detail: reworded ? copy.reworded : copy.unassigned };
}

function Line({ line, situation }: { line: BreakdownLine; situation: Situation | null }) {
  let title: ReactNode;
  let detail: ReactNode = null;
  if (line.kind === 'answer' && line.id) {
    const before = questionOf(line.id, line.before);
    const after = questionOf(line.id, line.after ?? line.before);
    title = after.text ?? before.text ?? line.id;
    detail = (
      <span className={styles.lineSwap}>
        <span>
          <span className={styles.lineKey}>{copy.before}</span>{' '}
          {line.before === null ? copy.notAsked : otherWording(line) ? copy.askedAnotherWay : before.option(line.before.k)}
        </span>
        <span>
          <span className={styles.lineKey}>{copy.after}</span> {line.after ? after.option(line.after.k) : copy.notAsked}
        </span>
      </span>
    );
  } else if (line.kind === 'extra') {
    title = (line.id && copy.extras[line.id]) || copy.extraFallback;
  } else if (line.kind === 'version') {
    title = copy.version;
  } else if (line.kind === 'other' && situation) {
    title = situation.title;
    detail = <span className={styles.lineSwap}>{situation.detail}</span>;
  } else {
    title = copy.other;
  }
  return (
    <li className={styles.line}>
      <span className={styles.lineText}>
        <span className={styles.lineTitle}>{title}</span>
        {detail}
        {line.source && <Tag className={styles.lineSource}>{copy.sources[line.source]}</Tag>}
      </span>
      <Change value={line.points} size="sm" />
    </li>
  );
}

function PriceLines({ area, part, catchUp, cohorts }: { area: AreaId | null; part: PriceBreakdown; catchUp: boolean; cohorts: Breakdown['cohorts'] }) {
  const lines = orderLines(part.lines);
  const situation = situationNote(cohorts, lines);
  return (
    <section className={styles.part} style={area ? sectorStyle(codeOf(area)) : undefined}>
      <div className={styles.partHead}>
        {area ? <SectorTag code={codeOf(area)} name /> : <span className={styles.partOverall}>{copy.overall}</span>}
        {part.delta !== null && round2(part.delta) !== 0 && <Change value={part.delta} size="sm" />}
      </div>
      {part.before !== null && part.after !== null && round2(part.after - part.before) !== 0 && (
        <p className={styles.partTarget}>{copy.targetMove(formatPrice(part.before), formatPrice(part.after))}</p>
      )}
      {lines.length > 0 ? <ul className={styles.lines}>{lines.map((line, i) => <Line key={`${line.kind}-${line.id ?? i}`} line={line} situation={situation} />)}</ul> : <p className={styles.partNone}>{catchUp ? copy.noLinesCatchUp : copy.noLines}</p>}
    </section>
  );
}

export interface MoveBreakdownProps {
  /** The answer of GET /api/me/breakdown/day, or null while it loads or after it failed. */
  data: DayBreakdownResponse | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** The sectors to list. One on the market home, all five in the log. */
  areas: readonly AreaId[];
  /** Most points a sector moves in one day, for the sentence on how to read the lines. */
  limit: number;
  /** Sectors whose shown price moved on the day while their target did not: say they were catching up. */
  catchingUp?: ReadonlySet<AreaId>;
  className?: string;
}

/**
 * "Why it moved" for one day: for each sector the change of its target and the answers and
 * records behind it. The lines of a sector add up to the change of its target.
 */
export function MoveBreakdown({ data, loading, error, onRetry, areas, limit, catchingUp, className }: MoveBreakdownProps) {
  if (error && !data) {
    return (
      <div className={cx(styles.breakdownState, className)}>
        <p>{copy.error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {copy.retry}
        </Button>
      </div>
    );
  }
  if (!data || loading) {
    return (
      <div className={cx(styles.breakdownState, className)} role="status">
        <span className="vh">{copy.loading}</span>
        <Skeleton height={28} width={140} radius={999} />
        <SkeletonText lines={3} />
      </div>
    );
  }
  if (!data.breakdown || data.from === null || data.to === null) {
    return <p className={cx(styles.partNone, className)}>{copy.noMoveYet}</p>;
  }
  const parts = data.breakdown.sectors;
  const cohorts = data.breakdown.cohorts;
  const listed = areas.filter((area) => parts[area]);
  // With several sectors on one sheet, those with nothing to explain share one line.
  const quiet = listed.length > 1 ? listed.filter((area) => parts[area].lines.length === 0 && !catchingUp?.has(area)) : [];
  const shown = listed.filter((area) => !quiet.includes(area));
  return (
    <div className={cx(styles.breakdown, className)}>
      <p className={styles.between}>
        {data.from === data.to ? copy.afterCheck(formatDay(data.to)) : copy.between(formatDay(data.from), formatDay(data.to))}
      </p>
      {shown.map((area) => (
        <PriceLines key={area} area={area} part={parts[area]} catchUp={catchingUp?.has(area) ?? false} cohorts={cohorts} />
      ))}
      {quiet.length > 0 && <p className={styles.partNone}>{copy.quiet(quiet.map(codeOf))}</p>}
      <p className={styles.howTo}>{copy.howToRead(limit)}</p>
    </div>
  );
}
