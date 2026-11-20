'use client';

/**
 * Pieces the four micro apps and the log hub share: the head with the way back, the states
 * (not open yet, not offered, an error), a small radio group, a titled list of statements, and
 * the block that shows what a record moved. Presentation only: no data is fetched here.
 */
import Link from 'next/link';
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { shared as copy } from '@/copy/micro';
import type { AreaId } from '@/engine';
import type { DayBreakdownResponse, MeLive } from '@/shared/api';
import { Button } from '../Button';
import { Card } from '../Card';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { IconCheck, IconChevron } from '../icons';
import { caughtUp, codeOf, isCatchingUp, litToday, livePrices, liveStatus, type CountWindow } from '../market/live';
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
  /** The h1. Leave out on a done state, where the Recorded line under it is the heading. */
  title?: string;
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
      {title !== undefined && <h1 className="t-h1">{title}</h1>}
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

// ---------------------------------------------------------------- after a record

/**
 * When a screen switches to its done state (or back to a form), it starts at the top and a
 * keyboard continues from its heading. Not when the screen opens. Returns the ref for that
 * heading, which needs tabIndex={-1}.
 */
export function useTopOnChange<T extends HTMLElement = HTMLHeadingElement>(key: string | number | boolean | null): RefObject<T | null> {
  const ref = useRef<T>(null);
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    window.scrollTo(0, 0);
    ref.current?.focus({ preventScroll: true });
  }, [key]);
  return ref;
}

export interface RecordedProps {
  /** What was recorded, such as "Payday recorded". */
  title: string;
  /** One line under it: the day, and what was sent. */
  detail?: ReactNode;
  /** h1 when it is the heading of the screen. */
  level?: 1 | 2;
  headingRef?: Ref<HTMLHeadingElement>;
  /** The colour of the mark. */
  sector: SectorCode;
  /** Recorded in this visit: the mark fills in once (not under reduced motion). */
  fresh?: boolean;
  className?: string;
}

/** The top of a done state: a check in the sector colour, what was recorded, and when. */
export function Recorded({ title, detail, level = 2, headingRef, sector, fresh = false, className }: RecordedProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header className={cx(styles.recorded, fresh && styles.fresh, className)} style={sectorStyle(sector)}>
      <span className={styles.recordedMark} aria-hidden="true">
        <IconCheck size={30} />
      </span>
      <div className={styles.recordedText}>
        <Heading ref={headingRef} tabIndex={-1} className={styles.recordedTitle}>
          {title}
        </Heading>
        {detail !== undefined && <p className={styles.recordedDetail}>{detail}</p>}
      </div>
    </header>
  );
}

/**
 * The rules and the fine print of a micro app, closed until asked for: what was sent, what a
 * record updates, how it counts. A native details element, so it works without script.
 */
export function More({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <details className={cx(styles.more, className)}>
      <summary className={styles.moreSummary}>
        <span>{copy.more}</span>
        <IconChevron className={styles.moreChevron} size={18} />
      </summary>
      <div className={styles.moreBody}>{children}</div>
    </details>
  );
}

/**
 * Progress toward a counting rule, as `need` windows with `have` of them lit, and the rule in
 * words. Shown only when the server sends the window (countWindow in market/live.ts).
 */
export function Meter({ window: w, text, sector }: { window: CountWindow; text: string; sector: SectorCode }) {
  const lit = Math.min(w.have, w.need);
  return (
    <div className={styles.meter} style={sectorStyle(sector)}>
      <p className={styles.meterText}>{text}</p>
      <div className={styles.meterRow} aria-hidden="true">
        <span className={styles.meterCells}>
          {Array.from({ length: w.need }, (_, i) => (
            <i key={i} className={cx(styles.meterCell, i < lit && styles.meterOn)} />
          ))}
        </span>
        <span className={styles.meterFig}>{copy.meterFig(lit, w.need)}</span>
      </div>
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
}

/**
 * What a record moved: today's skyline with the lights of the sectors updated today, the price
 * and change of the sectors the app feeds, a line when a price is still catching up, and the
 * answers and records behind today's change. When no row moved, the rows carry no line of
 * their own: the change pill says it, and the breakdown under the rows says why.
 */
export function Moved({ live, areas, label, breakdown, skyNote }: MovedProps) {
  const today = breakdown?.data && breakdown.data.to === live.today ? breakdown.data : null;
  const unchanged = (area: AreaId) => {
    const s = live.sectors[area];
    return s.status === 'listed' && (s.change === null || s.change === 0);
  };
  const moved = (area: AreaId) => {
    const s = live.sectors[area];
    return s.status === 'listed' && s.change !== null && s.change !== 0;
  };
  const someMoved = areas.some(moved);
  return (
    <div className={styles.result}>
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
                : someMoved && unchanged(area)
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
