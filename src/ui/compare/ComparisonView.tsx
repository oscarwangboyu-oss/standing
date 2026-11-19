'use client';

/**
 * One comparison: two people side by side on one scale. Side by side from 700px, stacked on a
 * phone. There is no winner and no ranking: the difference of two prices is a plain number in
 * ink, never a gain or a loss.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorCodeOf, useAsync } from '@/client/api';
import { ROUTES } from '@/client/nav';
import { useShell } from '@/client/shell';
import * as copy from '@/copy/compare';
import { typeForPair } from '@/copy/types';
import type { CompareSide } from '@/shared/api';
import {
  AREA_CODE,
  Block,
  Button,
  Card,
  IconChevron,
  IconLink,
  Note,
  Pentagon,
  Price,
  SECTOR_CODES,
  SectorTag,
  Sheet,
  Skeleton,
  SkylineCard,
  Spot,
  Ticker,
  TypeCard,
  formatChange,
  formatPrice,
  positionFraction,
  sectorStyle,
  skylineTop,
  type SectorCode,
} from '@/ui';
import styles from './compare.module.css';

const CODE_AREA = { SKIL: 'C', WLTH: 'W', NETW: 'N', BODY: 'B', MIND: 'M' } as const;

function pricesOf(side: CompareSide): Record<SectorCode, number | null> {
  const out = {} as Record<SectorCode, number | null>;
  for (const code of SECTOR_CODES) out[code] = side.sectors[CODE_AREA[code]];
  return out;
}

interface Person {
  ticker: string;
  side: CompareSide;
  prices: Record<SectorCode, number | null>;
  pair: [SectorCode, SectorCode] | null;
  seed: number;
}

function personOf(side: CompareSide, fallback: string, seed: number): Person {
  const pair = side.type ? ([AREA_CODE[side.type[0]], AREA_CODE[side.type[1]]] as [SectorCode, SectorCode]) : null;
  return { ticker: side.ticker ?? fallback, side, prices: pricesOf(side), pair: pair && typeForPair(pair[0], pair[1]) ? pair : null, seed };
}

function Bar({ value }: { value: number | null }) {
  return (
    <span className={styles.bar} aria-hidden="true">
      {value !== null && <i style={{ width: `${Math.max(4, positionFraction(value) * 100)}%` }} />}
    </span>
  );
}

export function ComparisonView({ id }: { id: string }) {
  const router = useRouter();
  const loaded = useAsync(() => api.comparison(id), [id]);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);

  useShell({
    width: 'wide',
    headerRight: (
      <Button variant="secondary" size="sm" icon={<IconLink size={18} />} href={ROUTES.compare}>
        {copy.view.invite}
      </Button>
    ),
  });

  const back = (
    <Button variant="quiet" size="sm" href={ROUTES.compare} icon={<IconChevron className={styles.backIcon} size={16} />}>
      {copy.view.back}
    </Button>
  );

  if (!loaded.data) {
    if (!loaded.loaded) {
      return (
        <div className={styles.waiting}>
          <Skeleton width="60%" height={40} radius={12} />
          <Skeleton height={220} radius={28} />
          <Skeleton height={220} radius={28} />
        </div>
      );
    }
    const missing = errorCodeOf(loaded.error) === 'not_found';
    return (
      <div className={styles.message}>
        <Spot kind="lot" />
        <h1 className="t-h1">{missing ? copy.view.missing : copy.view.failed}</h1>
        <div className={styles.messageActions}>
          {!missing && (
            <Button variant="secondary" onClick={() => void loaded.refresh()}>
              {copy.view.retry}
            </Button>
          )}
          {back}
        </div>
      </div>
    );
  }

  const { comparison } = loaded.data;
  const me = personOf(comparison.me, copy.view.noTickerMe, 7);
  const other = personOf(comparison.other, copy.view.noTickerOther, 12);
  const top = skylineTop(me.prices, other.prices);

  const remove = async () => {
    setRemoving(true);
    setRemoveFailed(false);
    try {
      await api.deleteComparison(id);
      router.replace(ROUTES.compare);
    } catch (error) {
      // Already gone counts as deleted.
      if (errorCodeOf(error) === 'not_found') router.replace(ROUTES.compare);
      else setRemoveFailed(true);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className={styles.backRow}>{back}</div>
      <h1 className="t-h1">{copy.view.title}</h1>
      <p className={styles.lead}>{copy.view.lead}</p>

      <div className={styles.pair}>
        {[me, other].map((who, index) => (
          <section key={index} className={styles.person} aria-label={copy.view.personLabel(who.ticker, who.side.overall === null ? null : formatPrice(who.side.overall))}>
            <div className={styles.personHead}>
              <span className={styles.personWho}>
                <Ticker variant="chip">{who.ticker}</Ticker>
                {index === 0 && <span className={styles.you}>{copy.view.you}</span>}
              </span>
              {who.side.overall !== null ? <Price value={who.side.overall} size="lg" /> : <span className={styles.none}>{copy.view.noOverall}</span>}
            </div>
            <SkylineCard prices={who.prices} top={top} seed={who.seed} />
            {who.pair ? (
              <TypeCard pair={who.pair} compact />
            ) : (
              <div className={styles.noType}>
                <p className={styles.noTypeName}>{copy.view.noType}</p>
                <p className={styles.noTypeLine}>{copy.view.noTypeLine}</p>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className={styles.lower}>
        <Block title={copy.view.sectors} id="c-sectors">
          <Card>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <Ticker size="sm">{me.ticker}</Ticker>
                  </th>
                  <th scope="col">
                    <span className="vh">{copy.view.sectorHeading}</span>
                  </th>
                  <th scope="col">
                    <Ticker size="sm">{other.ticker}</Ticker>
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTOR_CODES.map((code) => {
                  const a = me.prices[code];
                  const b = other.prices[code];
                  return (
                    <tr key={code} style={sectorStyle(code)}>
                      <td>
                        {a !== null ? <Price value={a} size="md" /> : <span className={styles.none}>{copy.view.noPrice}</span>}
                        <Bar value={a} />
                      </td>
                      <th scope="row">
                        <SectorTag code={code} />
                        {a !== null && b !== null && <span className={styles.gap}>{formatChange(a - b)}</span>}
                      </th>
                      <td>
                        {b !== null ? <Price value={b} size="md" /> : <span className={styles.none}>{copy.view.noPrice}</span>}
                        <Bar value={b} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={styles.caption}>{copy.view.tableCaption(me.ticker, other.ticker)}</p>
          </Card>
        </Block>

        <Block title={copy.view.shapes} id="c-shape">
          <Card className={styles.shape}>
            <Pentagon prices={me.prices} other={other.prices} values={false} />
            <p className={styles.caption}>{copy.view.shapesCaption(me.ticker, other.ticker)}</p>
          </Card>
        </Block>
      </div>

      <Note className={styles.note} title={copy.privacy.title}>
        <p>{copy.privacy.line}</p>
        <p>{copy.view.fresh}</p>
      </Note>

      <div className={styles.remove}>
        <Button variant="quiet" onClick={() => setAsking(true)}>
          {copy.view.remove}
        </Button>
      </div>

      <Sheet open={asking} onClose={() => setAsking(false)} title={copy.view.removeTitle}>
        <div className={styles.confirm}>
          <p className={styles.confirmLine}>{copy.view.removeLine}</p>
          {removeFailed && (
            <p className={styles.error} role="alert">
              {copy.view.removeFailed}
            </p>
          )}
          <div className={styles.confirmActions}>
            <Button size="lg" full onClick={remove} disabled={removing} data-action="delete-comparison">
              {copy.view.removeConfirm}
            </Button>
            <Button variant="secondary" size="lg" full onClick={() => setAsking(false)}>
              {copy.view.removeCancel}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
