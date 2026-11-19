/**
 * Draws the share image on a canvas at 1080 x 1350 and returns a PNG. Browser only.
 * The scene is the same Skyline as on the page, turned into an SVG image; the text is the same
 * list of operations as ShareCard renders, painted with the page's fonts once they have loaded.
 */
import { createElement } from 'react';
import { SkylineScene } from '../skyline/Skyline';
import { SHARE_ART_H, SHARE_COLORS, SHARE_HEIGHT, SHARE_WIDTH, shareCardLayout, shareFontShorthand, type ShareCardData, type ShareOp } from './layout';
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
    } else {
      ctx.font = shareFontShorthand(op.font);
      // Width is set through the canvas property where the browser has it; elsewhere the text is a little wider.
      if ('fontStretch' in ctx) (ctx as Ctx & { fontStretch: string }).fontStretch = op.font.stretch ?? 'normal';
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
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
export async function shareArtSvg(data: ShareCardData): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(createElement(SkylineScene, shareArt(data)));
}

/** Make sure every face the card uses is loaded, so the canvas never draws a fallback font. */
export async function loadShareFonts(data: ShareCardData): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const wanted = new Map<string, string>();
  for (const op of shareCardLayout(data)) {
    if (op.kind === 'text') wanted.set(shareFontShorthand(op.font), op.text);
  }
  await Promise.all(Array.from(wanted, ([font, text]) => document.fonts.load(font, text)));
  await document.fonts.ready;
}

/** The share image as a PNG blob, 1080 x 1350. Waits for the fonts, then rasterises the scene and paints the text. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  await loadShareFonts(data);
  const svg = await shareArtSvg(data);
  const art = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = SHARE_COLORS.sky;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  ctx.drawImage(art, 0, 0, SHARE_WIDTH, SHARE_ART_H);
  drawShareOps(ctx, shareCardLayout(data));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))), 'image/png');
  });
}
