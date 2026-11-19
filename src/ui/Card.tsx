import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import type { SectorCode } from './sectors';
import { sectorStyle } from './Tag';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  /** raised: a white surface with a soft shadow. flat: an outline, no shadow. sunk: a quiet area on the page. */
  variant?: 'raised' | 'flat' | 'sunk';
  /** Tint the card with a sector's wash. */
  sector?: SectorCode;
  /** Inner padding. none for a card whose content runs to the edge, such as a skyline. */
  pad?: 'none' | 'sm' | 'md' | 'lg';
  as?: ElementType;
  children: ReactNode;
  className?: string;
}

/** A surface. Radius 22px, or 28px with large padding. */
export function Card({ variant = 'raised', sector, pad = 'md', as: Tag = 'div', children, className, style, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(styles.card, styles[variant], styles[`pad_${pad}`], sector && styles.sector, className)}
      style={sector ? { ...sectorStyle(sector), ...style } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
