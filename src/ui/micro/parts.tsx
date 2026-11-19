'use client';

/**
 * Pieces the four micro apps and the log hub share: the head with the way back, the states
 * (not open yet, not offered, an error), a small radio group, a titled list of statements, and
 * the block that shows what a record moved. Presentation only: no data is fetched here.
 */
import Link from 'next/link';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { shared as copy } from '@/copy/micro';
import type { AreaId } from '@/engine';
import type { DayBreakdownResponse, MeLive } from '@/shared/api';
import { Button } from '../Button';
import { Card } from '../Card';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { IconCheck, IconChevron } from '../icons';
import { caughtUp, codeOf, isCatchingUp, litToday, livePrices, liveStatus } from '../market/live';
import { MoveBreakdown } from '../market/MoveBreakdown';
import type { SectorCode } from '../sectors';
import { SectorBoard, SectorRow } from '../SectorRow';
import { Skeleton, SkeletonText } from '../Skeleton';
import { SkylineCard } from '../skyline/SkylineCard';
import { Spot, type SpotKind } from '../skyline/Spot';
import { SectorTag, sectorStyle } from '../Tag';
import styles from './micro.module.css';

// ---------------------------------------------------------------- head

export interface MicroHeadProps {
  title: string;
  lead?: ReactNode;
  /** The sectors the app keeps current. */
  sectors?: readonly SectorCode[];
  /** Where the way back leads, with its label. Leave out on a screen of the dock. */
  back?: { href: string; label: string; name: string };
}

/** The top of a micro app: the way back, the sector tags, the title, one line. */
export function MicroHead({ title, lead, sectors, back }: MicroHeadProps) {
  return (
    <header className={styles.head}>
      {back && (
        <Link href={back.href} className={styles.back} aria-label={back.label}>
          <IconChevron size={18} />
          {back.name}
        </Link>
      )}
      {sectors && sectors.length > 0 && (
        <div className={styles.headTags}>
          {sectors.map((code) => (
            <SectorTag key={code} code={code} name />
          ))}
        </div>
      )}
      <h1 className="t-h1">{title}</h1>
      {lead !== undefined && <p className={styles.lead}>{lead}</p>}
    </header>
  );
}

// ---------------------------------------------------------------- states

export interface MicroStateProps {
  spot?: SpotKind;
  title: string;
  children: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
}

/** A whole-screen state of a micro app: not open yet, not offered, consent needed. */
export function MicroState({ spot = 'lot', title, children, actions }: MicroStateProps) {
  return (
    <Card pad="lg" variant="flat">
      <div className={styles.state}>
        <Spot kind={spot} size={132} />
        <h2 className="t-h3">{title}</h2>
        {children}
        {actions && <div className={styles.stateActions}>{actions}</div>}
      </div>
    </Card>
  );
}

/** "Not open yet": the switch of the app is off. */
export function MicroClosed({ name, home }: { name: string; home: string }) {
  return (
    <MicroState title={copy.closedTitle(name)} actions={<Button variant="secondary" href={home}>{copy.toMarket}</Button>}>
      <p>{copy.closed}</p>
    </MicroState>
  );
}

/** While /api/me and /api/config load. */
export function MicroSkeleton() {
  return (
    <div className={styles.skeleton}>
      <Skeleton height={40} width="60%" radius={12} />
      <SkeletonText lines={2} />
      <Skeleton height={220} radius={22} />
    </div>
  );
}

/** The sentence for a failed write, by the code of the error. */
export function errorMessage(code: string): string {
  const known = copy.errors as Record<string, string>;
  if (code === 'network' || code === 'bad_response' || code === 'internal_error') return copy.errors.network;
  return known[code] ?? copy.errors.fallback;
}

/** One line that says a write failed and what to do. Announced at once. */
export function MicroError({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- pills

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

export interface PillsProps<T extends string> {
  options: ReadonlyArray<PillOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name, or the id of a visible label. */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A small radio group as pills, for a choice inside a form (who a person is to you, yes or
 * no). One tab stop; the arrow keys move and choose, as in a native radio group. The chosen
 * pill takes the sector colour and a check, so it is not marked by colour alone.
 */
export function Pills<T extends string>({ options, value, onChange, label, labelledBy, disabled = false, className }: PillsProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const checked = options.findIndex((o) => o.value === value);
  const tabStop = checked >= 0 ? checked : 0;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = buttons.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (at + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (at - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
    const option = options[next];
    if (option) onChange(option.value);
  };
  return (
    <div ref={root} role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cx(styles.pills, className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={disabled}
          className={styles.pill}
          onClick={() => onChange(o.value)}
        >
          <IconCheck className={styles.pillMark} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- facts

/** A titled list of short statements: what was sent, what this updates, how it counts. */
export function Facts({ title, note, items, sector }: { title: string; note?: ReactNode; items: ReadonlyArray<ReactNode>; sector?: SectorCode }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false);
  return (
    <section className={styles.facts} style={sector ? sectorStyle(sector) : undefined}>
      <h2 className={styles.factsTitle}>{title}</h2>
      {note !== undefined && <p className={styles.factsNote}>{note}</p>}
      <ul className={styles.factList}>
        {shown.map((item, i) => (
          <li key={i} className={styles.fact}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- what it moved

export interface MovedProps {
  live: MeLive;
  /** The sectors the app feeds. */
  areas: readonly AreaId[];
  /** Accessible name of the rows. */
  label: string;
  /** The breakdown of today against yesterday, when it was fetched. */
  breakdown?: { data: DayBreakdownResponse | null; loading: boolean; error: boolean; onRetry: () => void };
  /** A line under the skyline. */
  skyNote?: ReactNode;
  /** A heading above the skyline, such as "Payday recorded". */
  heading?: string;
}

/**
 * What a record moved: today's skyline with the lights of the sectors updated today, the price
 * and change of the sectors the app feeds, a line when a price is still catching up, and the
 * answers and records behind today's change.
 */
export function Moved({ live, areas, label, breakdown, skyNote, heading }: MovedProps) {
  const today = breakdown?.data && breakdown.data.to === live.today ? breakdown.data : null;
  return (
    <div className={styles.result}>
      {heading !== undefined && <h2 className={styles.formTitle}>{heading}</h2>}
      <div>
        <SkylineCard prices={livePrices(live)} status={liveStatus(live)} lit={litToday(live)} size="small" />
        {skyNote !== undefined && <p className={styles.skyNote}>{skyNote}</p>}
      </div>
      <Card>
        <SectorBoard label={label}>
          {areas.map((area) => {
            const sector = live.sectors[area];
            const code = codeOf(area);
            const line = sector.resumed
              ? copy.resumed(code)
              : isCatchingUp(sector)
                ? copy.catchingUp(code, formatPrice(sector.target as number), live.moveLimit)
                : sector.status === 'listed' && (sector.change === null || sector.change === 0)
                  ? copy.noChangeToday
                  : undefined;
            return (
              <SectorRow key={area} code={code} price={sector.price} change={sector.change} status={sector.status} tag={sector.resumed ? 'resumed' : null}>
                {line}
              </SectorRow>
            );
          })}
        </SectorBoard>
        {breakdown && (today || breakdown.loading || breakdown.error) && (
          <MoveBreakdown
            className={styles.movedBreakdown}
            data={today}
            loading={breakdown.loading}
            error={breakdown.error}
            onRetry={breakdown.onRetry}
            areas={areas.filter((area) => live.sectors[area].price !== null)}
            limit={live.moveLimit}
            catchingUp={caughtUp(today)}
          />
        )}
      </Card>
    </div>
  );
}
