import { shareCard as copy } from '@/copy/common';
import { cx } from '../cx';
import { formatPrice } from '../format';
import { SkylineScene, type SkylineSceneProps } from '../skyline/Skyline';
import { SKY_PALETTES } from '../skyline/palette';
import { SHARE_COLORS, SHARE_FAMILY, SHARE_SCENE_W, shareCardLayout, sharePrices, shareScene, shareSize, type ShareCardData, type ShareFont, type ShareFormat } from './layout';
import styles from './ShareCard.module.css';

/** The dusk palette without the scene's own stars: the layout draws them where the text is not. */
const CARD_PALETTE = { ...SKY_PALETTES.dusk, star: 'none' };

/** The props of the scene on the card: the person's skyline at dusk, every light on, drawn in plain colours. */
export function shareArt(data: ShareCardData, format: ShareFormat = 'post'): SkylineSceneProps {
  const scene = shareScene(format);
  return {
    prices: sharePrices(data),
    size: 'card',
    sceneWidth: SHARE_SCENE_W,
    top: scene.top,
    detailTop: scene.detailTop,
    palette: CARD_PALETTE,
    lit: { SKIL: true, WLTH: true, NETW: true, BODY: true, MIND: true },
    label: '',
    seed: scene.seed,
    x: scene.x,
    y: scene.y,
    width: scene.width,
    height: scene.height,
  };
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;
const STRETCH = { normal: '100%', 'semi-condensed': '87.5%', condensed: '75%' } as const;

const fontStyle = (font: ShareFont) => ({ fontSize: font.size, fontWeight: font.weight, fontStretch: STRETCH[font.stretch ?? 'normal'] });

export interface ShareCardProps {
  data: ShareCardData;
  /** story: 9:16, 1080 x 1920. post: 4:5, 1080 x 1350. */
  format?: ShareFormat;
  className?: string;
}

/**
 * The share image as it will be saved, drawn as SVG at any width. renderShareCard draws the
 * same scene and the same operations on a canvas.
 */
export function ShareCard({ data, format = 'post', className }: ShareCardProps) {
  const { width, height } = shareSize(format);
  return (
    <svg
      className={cx(styles.card, className)}
      viewBox={`0 0 ${width} ${height}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label={copy.alt(data.ticker.toUpperCase(), formatPrice(data.price), data.type)}
      data-format={format}
    >
      <rect width={width} height={height} fill={SHARE_COLORS.sky} />
      <SkylineScene {...shareArt(data, format)} />
      {shareCardLayout(data, format).map((op, i) =>
        op.kind === 'rect' ? (
          <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r} fill={op.color} />
        ) : (
          <text
            key={i}
            x={op.x}
            y={op.y}
            textAnchor={ANCHOR[op.align]}
            fill={op.color}
            style={{ fontFamily: `"${SHARE_FAMILY[op.font.family]}", sans-serif`, ...fontStyle(op.font), fontVariantNumeric: 'tabular-nums lining-nums' }}
          >
            {op.text}
            {op.tail && <tspan style={fontStyle(op.tail.font)}>{op.tail.text}</tspan>}
          </text>
        ),
      )}
    </svg>
  );
}
