'use client';

import { useState } from 'react';
import { sectorNames } from '@/copy/common';
import { types as copy } from '@/copy/landing';
import { TYPES } from '@/copy/types';
import { cx } from '../cx';
import { TypeEmblem } from '../skyline/TypeEmblem';
import { SectorTag } from '../Tag';
import styles from './types.module.css';

/** The type shown first: the type of the sample person. */
const FIRST = Math.max(0, TYPES.findIndex((t) => t.pair[0] === 'SKIL' && t.pair[1] === 'BODY'));

/**
 * The ten types as a gallery: one type large, and all ten to choose from. The names and lines
 * come from src/copy/types.ts.
 */
export function TypeGallery() {
  const [at, setAt] = useState(FIRST);
  const type = TYPES[at] ?? TYPES[0]!;
  return (
    <div className={styles.gallery}>
      <article className={styles.feature} aria-live="polite">
        <TypeEmblem pair={type.pair} size={168} className={styles.emblem} />
        <div className={styles.text}>
          <p className={styles.label}>
            {copy.label} {at + 1} / {TYPES.length}
          </p>
          <h3 className={styles.name}>{type.name}</h3>
          <p className={styles.line}>{type.line}</p>
          <p className={styles.tags}>
            <SectorTag code={type.pair[0]} name />
            <SectorTag code={type.pair[1]} name />
            <span className="vh">{copy.pair(sectorNames[type.pair[0]], sectorNames[type.pair[1]])}</span>
          </p>
        </div>
      </article>
      <ul className={styles.list} aria-label={copy.pick}>
        {TYPES.map((t, i) => (
          <li key={t.name}>
            <button type="button" className={cx(styles.pick, i === at && styles.on)} aria-pressed={i === at} onClick={() => setAt(i)}>
              <TypeEmblem pair={t.pair} size={44} />
              <span className={styles.pickName}>{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
