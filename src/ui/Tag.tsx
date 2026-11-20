import type { CSSProperties, ReactNode } from 'react';
import { sectorNames, tagLabels } from '@/copy/common';
import { cx } from './cx';
import type { SectorCode, SectorTagKind } from './sectors';
import { SectorGlyph } from './skyline/SectorGlyph';
import styles from './Tag.module.css';

export interface TagProps {
  /** One of the market words, or free text as children. */
  kind?: SectorTagKind | 'sample';
  children?: ReactNode;
  className?: string;
}

/** A small word on a sector: Leader, Laggard, Limit up, Limit down, Halted, Resumed. */
export function Tag({ kind, children, className }: TagProps) {
  return <span className={cx(styles.tag, kind && styles[kind], className)}>{children ?? (kind ? tagLabels[kind] : null)}</span>;
}

/** The custom properties of a sector, for any element that wants to use its colours. */
export function sectorStyle(code: SectorCode): CSSProperties {
  const k = code.toLowerCase();
  return {
    '--sector': `var(--${k})`,
    '--sector-deep': `var(--${k}-deep)`,
    '--sector-tint': `var(--${k}-tint)`,
    '--sector-wash': `var(--${k}-wash)`,
    '--sector-line': `var(--${k}-line)`,
  } as CSSProperties;
}

export interface SectorTagProps {
  code: SectorCode;
  /** Show the sector name after the code: "SKIL Capability". Left out where the name is the code itself (BODY, MIND). */
  name?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** A sector's ticker on its own colour, with its building as a glyph. */
export function SectorTag({ code, name = false, size = 'md', className }: SectorTagProps) {
  const showName = name && sectorNames[code].toUpperCase() !== code;
  return (
    <span className={cx(styles.sector, styles[size], className)} style={sectorStyle(code)}>
      <SectorGlyph code={code} size={size === 'sm' ? 14 : 16} />
      <span className={styles.code}>{code}</span>
      {showName && <span className={styles.name}>{sectorNames[code]}</span>}
    </span>
  );
}
