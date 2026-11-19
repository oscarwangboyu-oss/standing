import { shareCard as copy } from '@/copy/common';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { SkylineScene, type SkylineSceneProps } from '../skyline/Skyline';
import { SKY_PALETTES } from '../skyline/palette';
import { SHARE_ART_H, SHARE_ART_TOP, SHARE_COLORS, SHARE_FAMILY, SHARE_HEIGHT, SHARE_SCENE_W, SHARE_WIDTH, shareCardLayout, sharePrices, type ShareCardData } from './layout';
import styles from './ShareCard.module.css';

/** The props of the scene on the card: the person's skyline at dusk, every light on, drawn in plain colours. */
export function shareArt(data: ShareCardData): SkylineSceneProps {
  return {
    prices: sharePrices(data),
    size: 'card',
    sceneWidth: SHARE_SCENE_W,
    top: SHARE_ART_TOP,
    detailTop: 20,
    palette: SKY_PALETTES.dusk,
    lit: { SKIL: true, WLTH: true, NETW: true, BODY: true, MIND: true },
    label: '',
    seed: 5,
    x: 0,
    y: 0,
    width: SHARE_WIDTH,
    height: SHARE_ART_H,
  };
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;
const STRETCH = { normal: '100%', 'semi-condensed': '87.5%', condensed: '75%' } as const;

export interface ShareCardProps {
  data: ShareCardData;
  className?: string;
}

/**
 * The share image as it will be saved, drawn as SVG at any width. renderShareCard draws the
 * same scene and the same operations on a canvas.
 */
export function ShareCard({ data, className }: ShareCardProps) {
  return (
    <svg
      className={cx(styles.card, className)}
      viewBox={`0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}`}
      role="img"
      aria-label={copy.alt(data.ticker.toUpperCase(), formatPrice(data.price), data.type)}
    >
      <rect width={SHARE_WIDTH} height={SHARE_HEIGHT} fill={SHARE_COLORS.sky} />
      <SkylineScene {...shareArt(data)} />
      {shareCardLayout(data).map((op, i) =>
        op.kind === 'rect' ? (
          <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r} fill={op.color} />
        ) : (
          <text
            key={i}
            x={op.x}
            y={op.y}
            textAnchor={ANCHOR[op.align]}
            fill={op.color}
            fontSize={op.font.size}
            fontWeight={op.font.weight}
            style={{ fontFamily: `"${SHARE_FAMILY[op.font.family]}", sans-serif`, fontStretch: STRETCH[op.font.stretch ?? 'normal'], fontVariantNumeric: 'tabular-nums lining-nums' }}
          >
            {op.text}
          </text>
        ),
      )}
    </svg>
  );
}
