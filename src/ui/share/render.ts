/**
 * Draws the share image on a canvas and returns a PNG: 1080 x 1920 for a story, 1080 x 1350 for
 * a post. Browser only. The scene is the same Skyline as on the page, turned into an SVG image;
 * the text is the same list of operations as ShareCard renders, painted with the page's fonts
 * once they have loaded.
 */
import { createElement } from 'react';
import { SkylineScene } from '../skyline/Skyline';
import { SHARE_COLORS, shareCardLayout, shareFontShorthand, shareSize, type ShareCardData, type ShareFont, type ShareFormat, type ShareOp } from './layout';
import { shareArt } from './ShareCard';

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** The width keyword goes in the shorthand and, where the browser has it, in the canvas property as well. */
function setFont(ctx: Ctx, font: ShareFont): void {
  ctx.font = shareFontShorthand(font);
  if ('fontStretch' in ctx) (ctx as Ctx & { fontStretch: string }).fontStretch = font.stretch ?? 'normal';
}

/** Paint the operations. Pure with respect to the document: everything it needs is passed in. */
export function drawShareOps(ctx: Ctx, ops: readonly ShareOp[]): void {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const op of ops) {
    ctx.fillStyle = op.color;
    if (op.kind === 'rect') {
      if (op.r) {
        roundRect(ctx, op.x, op.y, op.w, op.h, op.r);
        ctx.fill();
      } else {
        ctx.fillRect(op.x, op.y, op.w, op.h);
      }
      continue;
    }
    setFont(ctx, op.font);
    ctx.textAlign = op.align;
    ctx.fillText(op.text, op.x, op.y);
    if (op.tail) {
      // Measured as drawn, so the decimals follow the whole number in any browser.
      const advance = ctx.measureText(op.text).width;
      setFont(ctx, op.tail.font);
      ctx.textAlign = 'left';
      ctx.fillText(op.tail.text, op.x + advance, op.y);
    }
  }
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The skyline could not be drawn'));
    img.src = src;
  });
}

/** The scene of the card as a standalone SVG document. */
export async function shareArtSvg(data: ShareCardData, format: ShareFormat = 'post'): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(createElement(SkylineScene, shareArt(data, format)));
}

/** Make sure every face the card uses is loaded, so the canvas never draws a fallback font. */
export async function loadShareFonts(data: ShareCardData, format: ShareFormat = 'post'): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const wanted = new Map<string, string>();
  for (const op of shareCardLayout(data, format)) {
    if (op.kind !== 'text') continue;
    wanted.set(shareFontShorthand(op.font), op.text);
    if (op.tail) wanted.set(shareFontShorthand(op.tail.font), op.tail.text);
  }
  await Promise.all(Array.from(wanted, ([font, text]) => document.fonts.load(font, text)));
  await document.fonts.ready;
}

/** The share image as a PNG blob. Waits for the fonts, then rasterises the scene and paints the text. */
export async function renderShareCard(data: ShareCardData, format: ShareFormat = 'post'): Promise<Blob> {
  await loadShareFonts(data, format);
  const art = shareArt(data, format);
  const svg = await shareArtSvg(data, format);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const { width, height } = shareSize(format);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = SHARE_COLORS.sky;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, Number(art.x ?? 0), Number(art.y ?? 0), Number(art.width), Number(art.height));
  drawShareOps(ctx, shareCardLayout(data, format));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))), 'image/png');
  });
}
