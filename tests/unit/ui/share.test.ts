/**
 * The share image: two formats, every line of text inside one band of the sky, clear of its
 * edges, above the tallest tower, away from the stars, the clouds and the birds, and readable on
 * a phone. The band edges and the sky details are read from the scene as it is rendered, so a
 * change to the scene or to the crop shows up here.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { brand, shareCard as cardCopy } from '@/copy/common';
import { share as sheetCopy } from '@/copy/result';
import { TYPES } from '@/copy/types';
import { HORIZON_Y } from '@/ui/skyline/geometry';
import { SKY_PALETTES } from '@/ui/skyline/palette';
import { SkylineScene } from '@/ui/skyline/Skyline';
import { shareArt } from '@/ui/share/ShareCard';
import {
  DEFAULT_SHARE_FORMAT,
  SHARE_COLORS,
  SHARE_FORMATS,
  SHARE_HEIGHT,
  SHARE_MEASURE,
  SHARE_STAR_ROOM,
  SHARE_WIDTH,
  shareCardLayout,
  shareCeiling,
  shareColumnX,
  sharePrices,
  shareSafeArea,
  shareScene,
  shareSize,
  shareTextBox,
  shareWrap,
  type ShareCardData,
  type ShareFormat,
  type ShareOp,
  type ShareText,
} from '@/ui/share/layout';

const dusk = SKY_PALETTES.dusk;
/** Least room between a line of text and a band edge, the ceiling, a cloud or the edge of the panel. */
const CLEAR = 12;

type Box = { x0: number; x1: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box, room = 0) => a.x0 < b.x1 + room && a.x1 > b.x0 - room && a.top < b.bottom + room && a.bottom > b.top - room;

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const prices = (values: Array<number | null>) => (['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND'] as const).map((code, i) => ({ code, price: values[i] ?? null }));

const sample: ShareCardData = {
  ticker: 'rivr',
  price: 104.37,
  sectors: prices([111.2, 96.85, 103.4, 108.1, null]),
  type: 'The Engine',
};

/** Cards that stretch the layout: every type, the widest ticker, the highest and the lowest prices, no type. */
const VARIANTS: ShareCardData[] = [
  ...TYPES.map((t, i) => ({ ticker: ['rivr', 'AB', 'WWWWWW', 'MOON42'][i % 4] as string, price: [104.37, 145, 55, 99.99][i % 4] as number, sectors: prices([111.2, 96.85, 145, 55, 100]), type: t.name })),
  { ticker: 'WWWWWW', price: 145, sectors: prices([145, 145, 145, 145, 145]), type: 'The Long Runner' },
  { ticker: 'LEVL', price: 100.01, sectors: prices([100, 100, 100, 100, 100]), type: null },
];
const HOSTS = [null, 'standing.example', 'www.standingindex.com'];

/** The scene of a format as it is rendered: band edges, horizon and the sky details, in card px. */
function readScene(format: ShareFormat) {
  const art = shareArt(sample, format);
  const svg = renderToStaticMarkup(createElement(SkylineScene, art));
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
  if (!vb) throw new Error('no viewBox');
  const [vx, vy, vw, vh] = vb.slice(1).map(Number) as [number, number, number, number];
  const [X, Y, W, H] = [art.x, art.y, art.width, art.height].map(Number) as [number, number, number, number];
  // preserveAspectRatio="xMidYMax slice"
  const k = Math.max(W / vw, H / vh);
  const toX = (x: number) => X + (W - vw * k) / 2 + (x - vx) * k;
  const toY = (y: number) => Y + (H - vh * k) + (y - vy) * k;
  const band = (color: string) => {
    const m = new RegExp(`<rect x="0" y="([-\\d.]+)" width="${vw}" height="([-\\d.]+)" fill="${color}"`).exec(svg);
    if (!m) throw new Error(`no band ${color}`);
    return { y: Number(m[1]), h: Number(m[2]) };
  };
  const sky4 = band(dusk.sky4);
  const edges = [band(dusk.sky2).y, band(dusk.sky3).y, sky4.y].map(toY);
  const horizon = toY(sky4.y + sky4.h);
  const details: Box[] = [];
  // The sky details are drawn before the first tower; tower parts use their lot's coordinates.
  const backdrop = svg.slice(0, svg.indexOf('data-sector='));
  // Clouds: a translated, scaled group above the horizon.
  for (const m of backdrop.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">/g)) {
    const [x, y, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < HORIZON_Y) details.push({ x0: toX(x - 8 * s), x1: toX(x + 40 * s), top: toY(y - 7 * s), bottom: toY(y + 13 * s) });
  }
  // Birds.
  for (const m of backdrop.matchAll(/<path d="M([-\d.]+) ([-\d.]+)q/g)) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    details.push({ x0: toX(x), x1: toX(x + 10), top: toY(y - 3), bottom: toY(y + 1) });
  }
  // The setting sun and its halo.
  for (const m of backdrop.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="(\d+)" fill="(#[0-9A-F]{6})"/g)) {
    if (m[4] !== dusk.sun && m[4] !== dusk.halo) continue;
    const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    details.push({ x0: toX(cx - r), x1: toX(cx + r), top: toY(cy - r), bottom: toY(cy + r) });
  }
  return { svg, edges, horizon, details, top: Y };
}

const SCENES = Object.fromEntries(SHARE_FORMATS.map((f) => [f, readScene(f)])) as Record<ShareFormat, ReturnType<typeof readScene>>;

const texts = (ops: readonly ShareOp[]) => ops.filter((o): o is ShareText => o.kind === 'text');
const isStar = (op: ShareOp) => op.kind === 'rect' && op.color === SHARE_COLORS.star;

describe('share formats', () => {
  it('has a story at 1080 by 1920, the default, and a post at 1080 by 1350', () => {
    expect(shareSize('story')).toEqual({ width: 1080, height: 1920 });
    expect(shareSize('post')).toEqual({ width: 1080, height: 1350 });
    expect(DEFAULT_SHARE_FORMAT).toBe('story');
    expect(SHARE_FORMATS).toEqual(['story', 'post']);
  });
  it('keeps the top 230 and the bottom 240 pixels of a story free of text', () => {
    expect(shareSafeArea('story')).toEqual({ top: 230, bottom: 1920 - 240 });
  });
  it('says the size of the chosen format in the sheet', () => {
    expect(sheetCopy.size(1080, 1920)).toBe('1080 by 1920 pixels, PNG.');
    expect(sheetCopy.formats.story.ratio).toBe('9:16');
    expect(sheetCopy.formats.post.ratio).toBe('4:5');
  });
  it('fits the scene to the card: full width, ending where the panel starts', () => {
    for (const format of SHARE_FORMATS) {
      const s = shareScene(format);
      expect(s.width).toBe(SHARE_WIDTH);
      expect(s.y + s.height).toBeLessThan(SHARE_HEIGHT[format]);
      // The scene writes its viewBox to one decimal; the crop is chosen so it is not rescaled.
      expect(Math.round(s.top * 10) / 10).toBe(s.top);
    }
  });
});

describe.each(SHARE_FORMATS)('share card, %s', (format) => {
  const scene = SCENES[format];
  const { height } = shareSize(format);
  const safe = shareSafeArea(format);
  const ceiling = shareCeiling(format);
  const panelTop = shareScene(format).y + shareScene(format).height;
  const bandColor = (y: number) => [dusk.sky1, dusk.sky2, dusk.sky3, dusk.sky4][scene.edges.filter((e) => e <= y).length] as string;

  it('draws no stars of its own in the scene: the layout places them', () => {
    expect(scene.svg).not.toContain(`fill="${dusk.star}"`);
    expect(scene.edges).toHaveLength(3);
    expect(scene.horizon).toBeLessThan(panelTop);
  });

  for (const data of VARIANTS) {
    for (const host of HOSTS) {
      const ops = shareCardLayout(data, format, { host });
      const lines = texts(ops);
      const label = `${data.ticker} ${data.price} ${data.type ?? 'no type'} ${host ?? 'no host'}`;

      it(`puts each line of the sky inside one band, clear of its edges and of the tallest tower: ${label}`, () => {
        const pill = ops.find((o) => o.kind === 'rect' && o.color === SHARE_COLORS.pill);
        for (const op of lines.filter((o) => o.y < panelTop)) {
          const b = shareTextBox(op);
          const onPill = pill?.kind === 'rect' && b.x0 >= pill.x && b.x1 <= pill.x + pill.w && b.top >= pill.y && b.bottom <= pill.y + pill.h;
          for (const edge of [...scene.edges, scene.horizon]) {
            expect(edge > b.top - CLEAR && edge < b.bottom + CLEAR, `"${op.text}" ${b.top.toFixed(1)} to ${b.bottom.toFixed(1)} meets the band edge at ${edge.toFixed(1)}`).toBe(false);
          }
          expect(b.bottom, `"${op.text}" against the tallest tower`).toBeLessThanOrEqual(ceiling - CLEAR);
          expect(contrast(op.color, onPill ? SHARE_COLORS.pill : bandColor((b.top + b.bottom) / 2)), `"${op.text}" on its band`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`keeps stars, clouds, birds and the sun off the text: ${label}`, () => {
        const stars = ops.filter(isStar);
        expect(stars.length).toBeGreaterThan(8);
        for (const op of lines.filter((o) => o.y < panelTop)) {
          const b = shareTextBox(op);
          for (const s of stars) {
            if (s.kind !== 'rect') continue;
            const star = { x0: s.x, x1: s.x + s.w, top: s.y, bottom: s.y + s.h };
            const near = star.x0 < b.x1 + SHARE_STAR_ROOM.x && star.x1 > b.x0 - SHARE_STAR_ROOM.x && star.top < b.bottom + SHARE_STAR_ROOM.y && star.bottom > b.top - SHARE_STAR_ROOM.y;
            expect(near, `a star at ${star.x0.toFixed(0)},${star.top.toFixed(0)} is next to "${op.text}"`).toBe(false);
          }
          for (const d of scene.details) expect(overlaps(b, d, CLEAR), `"${op.text}" meets a cloud, a bird or the sun`).toBe(false);
        }
        for (const s of stars) {
          if (s.kind !== 'rect') continue;
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x + s.w).toBeLessThanOrEqual(SHARE_WIDTH);
          // Above every tower, so no star is drawn over a building.
          expect(s.y + s.h).toBeLessThan(ceiling);
        }
      });

      it(`keeps the panel text in the panel, the text in the safe area, and no two lines touching: ${label}`, () => {
        const boxes = lines.map((op) => ({ op, b: shareTextBox(op) }));
        for (const { op, b } of boxes) {
          expect(b.top, `"${op.text}" below the top of the safe area`).toBeGreaterThanOrEqual(safe.top);
          expect(b.bottom, `"${op.text}" above the bottom of the safe area`).toBeLessThanOrEqual(safe.bottom);
          expect(b.x0, `"${op.text}" inside the left margin`).toBeGreaterThanOrEqual(56);
          expect(b.x1, `"${op.text}" inside the right margin`).toBeLessThanOrEqual(SHARE_WIDTH - 56);
          if (op.y >= panelTop) {
            expect(b.top).toBeGreaterThanOrEqual(panelTop + CLEAR);
            expect(b.bottom).toBeLessThanOrEqual(height - CLEAR);
            expect(contrast(op.color, SHARE_COLORS.panel), `"${op.text}" on the panel`).toBeGreaterThanOrEqual(4.5);
          }
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const [a, c] = [boxes[i]!, boxes[j]!];
            expect(overlaps(a.b, c.b, 4), `"${a.op.text}" and "${c.op.text}" touch`).toBe(false);
          }
        }
      });

      it(`sets every line at 28px or more, so it reads on a phone: ${label}`, () => {
        for (const op of lines) {
          // The ticker sits on its pill and the codes head their columns; everything is at least 28px.
          expect(op.font.size, op.text).toBeGreaterThanOrEqual(28);
          if (op.tail) expect(op.tail.font.size).toBeGreaterThanOrEqual(28);
        }
      });

      it(`prints only the ticker, the prices, the type, the statements and the product: ${label}`, () => {
        const type = TYPES.find((t) => t.name === data.type);
        const allowed = new Set<string>([
          data.ticker.toUpperCase(),
          cardCopy.overall,
          cardCopy.baseline,
          cardCopy.disclaimer,
          brand.name,
          ...(host ? [host] : []),
          ...(data.type ? [data.type] : []),
          ...data.sectors.flatMap((s) => [s.code, ...(s.price === null ? [] : [s.price.toFixed(2)])]),
        ]);
        const whole = data.price.toFixed(2);
        for (const op of lines) {
          if (op.tail) {
            expect(op.text + op.tail.text).toBe(whole);
            continue;
          }
          if (type && type.line.includes(op.text)) continue;
          expect(allowed.has(op.text), `"${op.text}" is not one of the parts of the card`).toBe(true);
        }
        expect(lines.some((o) => o.tail !== undefined)).toBe(true);
        expect(lines.some((o) => o.text === host)).toBe(host !== null);
      });
    }
  }

  it('draws the line of the type under its name, from src/copy/types.ts', () => {
    const ops = texts(shareCardLayout(sample, format));
    const name = ops.find((o) => o.text === 'The Engine');
    const line = ops.filter((o) => TYPES.find((t) => t.name === 'The Engine')?.line.includes(o.text) && o !== name);
    expect(name).toBeDefined();
    expect(line.length).toBeGreaterThanOrEqual(1);
    for (const l of line) expect(l.y).toBeGreaterThan(name!.y);
    expect(texts(shareCardLayout({ ...sample, typeLine: 'Set by hand.' }, format)).some((o) => o.text === 'Set by hand.')).toBe(true);
    expect(texts(shareCardLayout({ ...sample, typeLine: null }, format)).some((o) => o.y > name!.y && o.y < panelTop)).toBe(false);
  });

  it('wraps every type line into two lines or fewer at full size', () => {
    const lineFont = texts(shareCardLayout(sample, format)).find((o) => TYPES[2]!.line.startsWith(o.text) && o.text !== sample.type)!.font;
    for (const t of TYPES) {
      const wrapped = shareWrap(t.line, lineFont, SHARE_MEASURE);
      expect(wrapped.lines.length, t.line).toBeLessThanOrEqual(2);
      expect(wrapped.font.size, t.line).toBe(lineFont.size);
      expect(wrapped.lines.join(' ')).toBe(t.line);
    }
  });

  it('draws the address under the name of the product only when there is one', () => {
    const plain = texts(shareCardLayout(sample, format, { host: null }));
    const withHost = texts(shareCardLayout(sample, format, { host: 'standing.example' }));
    expect(withHost.length).toBe(plain.length + 1);
    const word = withHost.find((o) => o.text === brand.name)!;
    const address = withHost.find((o) => o.text === 'standing.example')!;
    expect(address.y).toBeGreaterThan(word.y);
    expect(address.x).toBe(word.x);
    // By default the card follows brand.host.
    expect(texts(shareCardLayout(sample, format)).some((o) => o.text === brand.host)).toBe(brand.host !== null);
  });
});

describe('share card contents', () => {
  const ops = shareCardLayout(sample, 'post');
  const all = texts(ops).map((o) => o.text + (o.tail?.text ?? ''));
  it('prints the ticker, the overall price, the type and the listed sector prices', () => {
    expect(all).toContain('RIVR');
    expect(all).toContain('104.37');
    expect(all).toContain('The Engine');
    expect(all).toContain('111.20');
    expect(all).toContain('MIND');
    expect(all.filter((t) => /^\d+\.\d\d$/.test(t))).toHaveLength(5);
  });
  it('says the baseline is provisional and that it is not a security', () => {
    expect(all.some((t) => /provisional/.test(t))).toBe(true);
    expect(all.some((t) => /Not a security/.test(t))).toBe(true);
  });
  it('sets each sector price under its tower', () => {
    expect(shareColumnX(2)).toBeCloseTo(SHARE_WIDTH / 2);
    expect(shareColumnX(1) - shareColumnX(0)).toBeCloseTo(shareColumnX(4) - shareColumnX(3));
  });
  it('passes a missing price to the skyline as null', () => {
    expect(sharePrices(sample).MIND).toBeNull();
    expect(sharePrices(sample).SKIL).toBe(111.2);
  });
  it('breaks a type line after its first sentence when both halves fit', () => {
    expect(shareWrap('Capability and body lead. You have the skills and the physical energy to use them.', { size: 30, weight: 500, family: 'text' }, SHARE_MEASURE).lines).toEqual([
      'Capability and body lead.',
      'You have the skills and the physical energy to use them.',
    ]);
  });
});
