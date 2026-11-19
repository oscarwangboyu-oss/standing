import { cx } from '../cx';
import type { SectorCode } from '../sectors';
import styles from './emblem.module.css';

/** The silhouette of each sector's tower on a 20px grid, in the current colour. */
const SHAPES: Record<SectorCode, string> = {
  // A tower with a crane jib.
  SKIL: 'M7 18V7h7v11zM2 18v-5l2.5-2v2l2.5-2v7zM3 3h13v1.6H3zM11 3h1.6v4H11zM4.4 4.6h1.2V7H4.4z',
  // A pediment on columns.
  WLTH: 'M2 16.4h16V18H2zM10 2l8 5v1.4H2V7zM3.6 9.6h2.2v5.6H3.6zM8.9 9.6h2.2v5.6H8.9zM14.2 9.6h2.2v5.6h-2.2z',
  // Two slim towers and a bridge.
  NETW: 'M3 18V6l5-2v14zM12 18V4l5 2v12zM8 9h4v2.4H8zM4.8 1.4h1.4V5H4.8zM13.8 1.4h1.4V5h-1.4z',
  // A tower with a pool that hangs over the edge.
  BODY: 'M4 18V5h8v13zM3 3.4h15V7h-6V5H3zM13.4 7h3L13.4 10z',
  // A dome on a tower.
  MIND: 'M5 18V8.6h10V18zM6.2 7.4a3.8 3.8 0 0 1 7.6 0zM3 12.4a2 2 0 1 1 2 0V18H3z',
};

export interface SectorGlyphProps {
  code: SectorCode;
  /** px. Default 20. */
  size?: number;
  className?: string;
}

/** A sector's building as a small one-colour icon. Decoration next to the ticker. */
export function SectorGlyph({ code, size = 20, className }: SectorGlyphProps) {
  return (
    <svg className={cx(styles.glyph, className)} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={SHAPES[code]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
