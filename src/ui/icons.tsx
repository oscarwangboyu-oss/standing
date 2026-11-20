/**
 * The icon family. One grid (24), one stroke (1.8), round caps and joins, the current colour.
 * Every icon is decoration: the control that holds it carries the name.
 */
import type { ReactNode } from 'react';

export interface IconProps {
  /** px. Default 24. */
  size?: number;
  className?: string;
}

function Icon({ size = 24, className, children, filled = false }: IconProps & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      {children}
    </svg>
  );
}

const make = (d: string, filled = false) =>
  function Made(props: IconProps) {
    return (
      <Icon {...props} filled={filled}>
        <path d={d} />
      </Icon>
    );
  };

export const IconMarket = make('M3 20h18M5 20v-8h4v8M10.5 20V5h4v15M16 20v-6h3.5v6');
export const IconOpen = make('M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M5.6 9.6l2 2M18.4 9.6l-2 2M9 21.5h6');
export const IconLog = make('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01');
export const IconSettings = make('M4 7h8M16 7h4M4 17h4M12 17h8M14 9.2a2.2 2.2 0 1 0 0-4.4a2.2 2.2 0 0 0 0 4.4zM10 19.2a2.2 2.2 0 1 0 0-4.4a2.2 2.2 0 0 0 0 4.4z');
export const IconClose = make('M6 6l12 12M18 6L6 18');
export const IconChevron = make('M9.5 5l7 7l-7 7');
export const IconArrowRight = make('M4 12h15M13 6l6 6l-6 6');
export const IconShare = make('M12 15V4M8 8l4-4l4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5');
export const IconDownload = make('M12 4v11M8 11l4 4l4-4M5 20h14');
export const IconLink = make('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1');
export const IconPayday = make('M3 7.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5zM12 14.6a2.6 2.6 0 1 0 0-5.2a2.6 2.6 0 0 0 0 5.2zM6.6 9.6h.01M17.4 14.4h.01');
export const IconWin = make('M6 21V4M6 5h11l-2.6 3.5L17 12H6');
export const IconPeople = make('M9 11.2a3.2 3.2 0 1 0 0-6.4a3.2 3.2 0 0 0 0 6.4zM3.5 19.5a5.5 5.5 0 0 1 11 0M17 12a2.4 2.4 0 1 0 0-4.8M16.4 14.6a4.6 4.6 0 0 1 4.4 4.9');
export const IconRetake = make('M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5');
export const IconCheck = make('M5 12.5l4.5 4.5L19 7.5');
export const IconInfo = make('M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 11v5.4M12 7.7h.01');
export const IconCare = make('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z');
export const IconCompare = make('M2.5 20h19M4.5 20v-8h5.5v8M14 20V6h5.5v14');
export const IconCalendar = make('M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 3v4M16 3v4M4 10.5h16');
export const IconMinus = make('M6 12h12');
/** An equals sign: a price that did not move. A minus would read as a small loss. */
export const IconFlat = make('M6 9.5h12M6 14.5h12');
/** An open book: how scoring works. */
export const IconBook = make('M12 6.5C10.2 5.2 7.6 4.6 4 4.8v13.4c3.6-.2 6.2.4 8 1.7M12 6.5c1.8-1.3 4.4-1.9 8-1.7v13.4c-3.6-.2-6.2.4-8 1.7M12 6.5v13.4');
/** A padlock: the privacy notice. */
export const IconLock = make('M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.6v2');
/** A page with a folded corner and lines: the terms. */
export const IconDoc = make('M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5zM14 3.5v4h4M9 12h6M9 15.5h6');
/** Filled triangles for gains and losses: heavier than a line arrow, readable at 10px. */
export const IconUp = make('M12 5.5l7.5 12.5h-15z', true);
export const IconDown = make('M12 18.5L4.5 6h15z', true);

/** The mark: five towers on a street, one per sector. */
export function Mark({ size = 28, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <rect x={2} y={10} width={4} height={13} rx={1} fill="var(--skil)" />
      <rect x={7} y={14} width={4} height={9} rx={1} fill="var(--wlth)" />
      <rect x={12} y={6} width={4} height={17} rx={1} fill="var(--netw)" />
      <rect x={17} y={3} width={4} height={20} rx={1} fill="var(--body)" />
      <rect x={22} y={12} width={4} height={11} rx={1} fill="var(--mind)" />
      <rect x={1} y={24} width={26} height={2} rx={1} fill="currentColor" />
    </svg>
  );
}
