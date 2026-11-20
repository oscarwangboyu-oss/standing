'use client';

/**
 * Small parts of the team dashboard: number formats, a share with its counts, status and
 * breach tags (always a word, never colour alone), the CSV button, a section frame and a
 * table that scrolls inside its own box.
 */
import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { team as copy } from '@/copy/team';
import { EVALUATION } from '@/engine';
import type { Rate } from '@/shared/api';
import type { StandingTeamClient, TeamTable } from '@/shared/client';
import { Button, IconCheck, IconDownload, IconMinus, Note, SkeletonText, cx } from '@/ui';
import type { AsyncView } from '@/client/api';
import { saveFile } from '../settings/save';
import styles from './team.module.css';

// ---------------------------------------------------------------- numbers

/**
 * Below this many records a share is shown count first: "3 of 12" reads as what it is, where
 * "25.0%" would look exact. The same number the scoring tests need before they give a verdict.
 */
export const SMALL_N = EVALUATION.minRecords;

/**
 * A cohort smaller than this shows its head count and nothing else: with one or two people a
 * median, a low and a high are those people's own prices, and the dashboard shows no one person.
 */
export const MIN_COHORT = 5;

/** "83.6%". One decimal, so 2.9% and 3.1% can be told apart at the 3% line. */
export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return copy.common.noData;
  return `${(value * 100).toFixed(digits)}%`;
}

/** A whole percent for a threshold: "70%", "12.5%". */
export function line(value: number): string {
  const p = Math.round(value * 1000) / 10;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

export function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return copy.common.noData;
  return value.toFixed(digits);
}

/** "Nov 19, 2026, 1:38 PM" in the reader's own time. */
export function stamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------- a share with its counts

export interface RateViewProps {
  rate: Rate;
  /** A breach word. Shown as a tag next to the figure. */
  flag?: string | null;
  className?: string;
}

/**
 * A share, always with the counts it came from. With a small denominator the counts come
 * first and large, and the percentage second.
 */
export function RateView({ rate, flag, className }: RateViewProps) {
  if (rate.of === 0 || rate.rate === null) {
    return <span className={cx(styles.rate, styles.none, className)}>{copy.common.noData}</span>;
  }
  const small = rate.of < SMALL_N;
  const counts = copy.common.of(rate.count, rate.of);
  return (
    <span className={cx(styles.rate, className)}>
      <span className={styles.rateMain}>{small ? counts : pct(rate.rate)}</span>
      <span className={styles.rateSub}>
        {small ? pct(rate.rate) : counts}
        {small && <span className={styles.smallN}>{copy.common.smallN}</span>}
      </span>
      {flag && <Flag>{flag}</Flag>}
    </span>
  );
}

/** A count that stands out when it is small. */
export function Count({ n }: { n: number }) {
  const small = n < SMALL_N;
  return (
    <span className={cx(styles.count, small && styles.countSmall)}>
      {n}
      {small && <span className={styles.smallN}>{copy.common.smallN}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- tags

/** A red-line breach: an ink pill with a word. */
export function Flag({ children }: { children: ReactNode }) {
  return <span className={styles.flag}>{children}</span>;
}

export type StatusKind = 'met' | 'not_met' | 'none';

/** Met, Not met, No data yet. The word and the glyph carry the state; the fill only supports it. */
export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className={cx(styles.status, styles[`status_${kind}`])}>
      {kind === 'met' && <IconCheck size={14} />}
      {kind === 'not_met' && <IconMinus size={14} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- CSV

export interface CsvButtonProps {
  client: StandingTeamClient;
  table: TeamTable;
  /** What the file holds, for the accessible name: "the gates". */
  name: string;
  params?: Parameters<StandingTeamClient['csv']>[1];
  /** File name without the extension. */
  file: string;
}

/** True when the numbers on the page include simulated people. CSV files are then named "-simulated". */
export const SimulatedContext = createContext(false);

/** Downloads one table as CSV. The passphrase travels in the header, so the file is fetched and then saved. */
export function CsvButton({ client, table, name, params, file }: CsvButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const simulated = useContext(SimulatedContext);
  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      // A saved file loses the banner of the page, so its name carries the mark.
      saveFile(`${file}${simulated ? '-simulated' : ''}.csv`, 'text/csv;charset=utf-8', await client.csv(table, params));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={styles.csv}>
      {failed && (
        <span className={styles.csvFailed} role="alert">
          {copy.common.csvFailed}
        </span>
      )}
      <Button variant="secondary" size="sm" icon={<IconDownload size={18} />} onClick={download} disabled={busy} aria-label={copy.common.csvFor(name)}>
        {copy.common.csv}
      </Button>
    </span>
  );
}

// ---------------------------------------------------------------- frames

export interface SectionProps {
  id: string;
  title: string;
  lead?: ReactNode;
  /** CSV buttons and filters on the right of the title. */
  tools?: ReactNode;
  children: ReactNode;
}

/** One titled part of the dashboard. */
export function Section({ id, title, lead, tools, children }: SectionProps) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionText}>
          <h2 id={`${id}-title`} className={styles.sectionTitle}>
            {title}
          </h2>
          {lead !== undefined && <p className={styles.sectionLead}>{lead}</p>}
        </div>
        {tools !== undefined && <div className={styles.tools}>{tools}</div>}
      </div>
      {children}
    </section>
  );
}

/** A sub-heading inside a section, with its own tools. */
export function SubHead({ title, lead, tools }: { title: string; lead?: ReactNode; tools?: ReactNode }) {
  return (
    <div className={styles.subHead}>
      <div className={styles.sectionText}>
        <h3 className={styles.subTitle}>{title}</h3>
        {lead !== undefined && <p className={styles.sectionLead}>{lead}</p>}
      </div>
      {tools !== undefined && <div className={styles.tools}>{tools}</div>}
    </div>
  );
}

/** Loading, failed, or the content once the data is there. */
export function Loaded<T>({ view, children }: { view: AsyncView<T>; children: (data: T) => ReactNode }) {
  if (view.data) return <>{children(view.data)}</>;
  if (view.error) {
    return (
      <Note tone="info">
        <p>{copy.common.failed}</p>
        <Button variant="quiet" size="sm" onClick={() => void view.refresh()}>
          {copy.common.retry}
        </Button>
      </Note>
    );
  }
  return (
    <div className={styles.panel}>
      <SkeletonText lines={4} />
    </div>
  );
}

export interface TableBoxProps {
  /** The caption of the table, read by screen readers. */
  caption: string;
  /** Cap the height and scroll inside, for a table with one row per day. */
  tall?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A table inside its own scrolling box, so a wide table never makes the page scroll sideways.
 * The box can take keyboard focus, so it can be scrolled with the arrow keys.
 */
export function TableBox({ caption, tall = false, children, className }: TableBoxProps) {
  const id = useId();
  return (
    <div className={cx(styles.tableBox, tall && styles.tall, className)} role="region" aria-labelledby={id} tabIndex={0}>
      <table className={styles.table}>
        <caption id={id} className="vh">
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

export interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** A native select with its label on the left. */
export function Select({ label, value, onChange, options }: SelectProps) {
  const id = useId();
  return (
    <span className={styles.select}>
      <label htmlFor={id} className={styles.selectLabel}>
        {label}
      </label>
      <select id={id} className={styles.selectBox} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
