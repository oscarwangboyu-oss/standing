'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { sectorNames } from '@/copy/common';
import { result as copy, sample } from '@/copy/landing';
import { typeForPair } from '@/copy/types';
import { Button } from '../Button';
import { cx } from '../cx';
import { PRICE_MAX, PRICE_MIN, clamp, formatPrice, round2 } from '../format';
import { IconRetake } from '../icons';
import { Price } from '../Price';
import { SECTOR_CODES, type SectorCode } from '../sectors';
import { GROUND_Y, SCENE_H, priceAtHeight, towerHeight } from '../skyline/geometry';
import { Skyline } from '../skyline/Skyline';
import { TypeEmblem } from '../skyline/TypeEmblem';
import { SectorTag, Tag, sectorStyle } from '../Tag';
import { Ticker } from '../Ticker';
import styles from './sample.module.css';

/** The view of the scene is fixed, so the picture does not jump while a price moves. */
const TOP = 0;
const VIEW_H = SCENE_H - TOP;
/** Sliders move in steps of 0.05; an arrow key moves one whole point. */
const STEP = 0.05;
const snap = (v: number) => round2(Math.round(clamp(v, PRICE_MIN, PRICE_MAX) / STEP) * STEP);

/** The two highest sectors, highest first. A tie goes to the sector that comes first. */
function topPair(prices: Record<SectorCode, number>): readonly [SectorCode, SectorCode] {
  const ranked = [...SECTOR_CODES].sort((a, b) => prices[b] - prices[a] || SECTOR_CODES.indexOf(a) - SECTOR_CODES.indexOf(b));
  return [ranked[0] as SectorCode, ranked[1] as SectorCode];
}

/**
 * The sample result of the landing page. The visitor moves a sector price, by a slider or by
 * dragging a roof with a mouse, and the tower, the overall price and the type follow.
 * Nothing is stored and nothing is sent.
 */
const initial: Record<SectorCode, number> = sample.prices;

export function SampleQuote() {
  const [prices, setPrices] = useState<Record<SectorCode, number>>(initial);
  const [active, setActive] = useState<SectorCode | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef<SectorCode | null>(null);

  const set = (code: SectorCode, value: number) => setPrices((p) => (p[code] === value ? p : { ...p, [code]: value }));
  const overall = round2(SECTOR_CODES.reduce((sum, c) => sum + prices[c], 0) / SECTOR_CODES.length);
  const pair = topPair(prices);
  const type = typeForPair(pair[0], pair[1]);
  const changed = SECTOR_CODES.some((c) => prices[c] !== initial[c]);

  const priceAt = (clientY: number): number | null => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || box.height === 0) return null;
    const sceneY = TOP + ((clientY - box.top) / box.height) * VIEW_H;
    return snap(priceAtHeight(GROUND_Y - sceneY));
  };

  // A roof can be dragged with a mouse or a pen. A finger scrolls the page, so touch uses the sliders.
  const onRoofDown = (code: SectorCode) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = code;
    setActive(code);
    const v = priceAt(e.clientY);
    if (v !== null) set(code, v);
  };
  const onRoofMove = (code: SectorCode) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (dragging.current === code) {
      const v = priceAt(e.clientY);
      if (v !== null) set(code, v);
    } else if (dragging.current === null) {
      setActive(code);
    }
  };
  const onRoofUp = () => {
    dragging.current = null;
  };

  const onKey = (code: SectorCode) => (e: KeyboardEvent<HTMLInputElement>) => {
    const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'PageUp' ? 5 : e.key === 'PageDown' ? -5 : 0;
    if (by === 0) return;
    e.preventDefault();
    set(code, snap(prices[code] + by));
  };

  const guideTop = active ? ((GROUND_Y - towerHeight(prices[active]) - TOP) / VIEW_H) * 100 : 0;

  return (
    <div className={styles.sample}>
      <div className={styles.left}>
        <div className={styles.picture}>
          <div className={styles.stage} ref={stage}>
            <Skyline prices={prices} top={TOP} size="card" seed={7} />
            <div className={styles.lots} aria-hidden="true">
              {SECTOR_CODES.map((code) => (
                <div
                  key={code}
                  className={styles.lot}
                  onPointerDown={onRoofDown(code)}
                  onPointerMove={onRoofMove(code)}
                  onPointerUp={onRoofUp}
                  onPointerCancel={onRoofUp}
                  onPointerLeave={() => dragging.current === null && setActive((a) => (a === code ? null : a))}
                />
              ))}
            </div>
            {active && (
              <div className={styles.guide} style={{ top: `${guideTop}%`, ...sectorStyle(active) } as CSSProperties} aria-hidden="true">
                <span className={styles.guidePill}>
                  {active} {formatPrice(prices[active])}
                </span>
              </div>
            )}
          </div>
          <p className={styles.hint}>
            <Tag kind="sample">{sample.tag}</Tag>
            <span className={styles.hintFine}>{copy.hintFine}</span>
            <span className={styles.hintTouch}>{copy.hintTouch}</span>
          </p>
        </div>
        {type && (
          <div className={styles.type}>
            <TypeEmblem pair={pair} size={64} />
            <p className={styles.typeText}>
              <span className={styles.label}>{copy.type}</span>
              <span className={styles.typeName}>{type.name}</span>
              <span className={styles.typeLine}>{type.line}</span>
            </p>
          </div>
        )}
      </div>

      <div className={styles.quote}>
        <p className={styles.who}>
          <Ticker variant="chip" size="md">
            {sample.ticker}
          </Ticker>
          <span className={styles.cohort}>{sample.cohort}</span>
        </p>
        <div className={styles.overall}>
          <p className={styles.label}>{copy.overall}</p>
          <Price value={overall} size="hero" />
          <p className={styles.mean}>{copy.mean}</p>
        </div>

        <div className={styles.board}>
          {SECTOR_CODES.map((code) => {
            const v = prices[code];
            const frac = (v - PRICE_MIN) / (PRICE_MAX - PRICE_MIN);
            const id = `sample-${code}`;
            return (
              <div key={code} className={cx(styles.row, active === code && styles.rowActive)} style={{ ...sectorStyle(code), '--at': frac } as CSSProperties}>
                <label htmlFor={id} className={styles.rowLabel}>
                  <SectorTag code={code} name />
                </label>
                <Price value={v} size="md" className={styles.rowPrice} />
                <div className={styles.slider}>
                  <span className={styles.track} />
                  <span className={styles.fill} />
                  <span className={styles.par} />
                  <input
                    id={id}
                    type="range"
                    min={PRICE_MIN}
                    max={PRICE_MAX}
                    step={STEP}
                    value={v}
                    aria-label={copy.slider(sectorNames[code])}
                    aria-valuetext={copy.sliderValue(formatPrice(v))}
                    onChange={(e) => set(code, snap(Number(e.currentTarget.value)))}
                    onKeyDown={onKey(code)}
                    onFocus={() => setActive(code)}
                    onBlur={() => setActive((a) => (a === code ? null : a))}
                    onPointerDown={() => setActive(code)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.foot}>
          <span className={styles.note}>{sample.note}</span>
          {changed && (
            <Button variant="quiet" size="sm" icon={<IconRetake size={18} />} onClick={() => setPrices(initial)}>
              {copy.reset}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
