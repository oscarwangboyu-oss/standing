import { describe, expect, it } from 'vitest';
import { TYPES, typeForPair, typeForPrices } from '@/copy/types';
import { FLOOR, GROUND_Y, HORIZON_Y, LOT_W, PODIUM, SCENE_W, builtHeight, hash, lotX, priceAtHeight, towerHeight, viewTop, windowPaths } from '@/ui/skyline/geometry';
import { SKY_PALETTES, SKY_VARS, skylineCss } from '@/ui/skyline/palette';

describe('tower height', () => {
  it('is linear in the price above a fixed podium', () => {
    expect(towerHeight(55)).toBe(PODIUM);
    expect(towerHeight(105) - towerHeight(100)).toBeCloseTo(FLOOR);
    expect(towerHeight(145) - towerHeight(100)).toBeCloseTo(towerHeight(100) - towerHeight(55));
  });
  it('stops at the ends of the range', () => {
    expect(towerHeight(20)).toBe(towerHeight(55));
    expect(towerHeight(300)).toBe(towerHeight(145));
    expect(towerHeight(Number.NaN)).toBe(towerHeight(100));
  });
  it('is undone by priceAtHeight', () => {
    for (const p of [55, 96.85, 100, 111.2, 145]) expect(priceAtHeight(towerHeight(p))).toBeCloseTo(p);
  });
  it('puts the horizon where a price of 100 ends', () => {
    expect(HORIZON_Y).toBe(GROUND_Y - towerHeight(100));
    expect(GROUND_Y - towerHeight(111.2)).toBeLessThan(HORIZON_Y);
    expect(GROUND_Y - towerHeight(96.85)).toBeGreaterThan(HORIZON_Y);
  });
});

describe('scene layout', () => {
  it('centres the five lots', () => {
    expect(lotX(0)).toBe((SCENE_W - 5 * LOT_W) / 2);
    expect(lotX(4) + LOT_W).toBe(SCENE_W - lotX(0));
    expect(lotX(0, 800)).toBe(200);
  });
  it('fits the view to the tallest tower and never cuts the horizon', () => {
    expect(viewTop([towerHeight(145)])).toBeLessThanOrEqual(1);
    const ordinary = viewTop([towerHeight(111.2), towerHeight(96.85)]);
    expect(ordinary).toBeGreaterThan(0);
    expect(ordinary).toBeLessThan(GROUND_Y - towerHeight(111.2));
    expect(viewTop([towerHeight(60)])).toBeLessThanOrEqual(HORIZON_Y - 40);
  });
  it('builds a tower in equal shares per answer', () => {
    expect(builtHeight(0, 5, 100)).toBe(0);
    expect(builtHeight(2, 5, 100)).toBe(40);
    expect(builtHeight(5, 5, 100)).toBe(100);
    expect(builtHeight(9, 5, 100)).toBe(100);
    expect(builtHeight(1, 0, 100)).toBe(0);
  });
});

describe('windows', () => {
  const grid = { x: 4, top: -60, bottom: -9, cols: 3, pitchX: 9, pitchY: FLOOR, winW: 6, winH: 6, seed: 7, lit: 0.5 };
  it('draws one window per column and floor', () => {
    const { glass, lit, rows } = windowPaths(grid);
    expect(rows).toBe(4);
    expect((glass + lit).match(/M/g)?.length).toBe(12);
  });
  it('is the same every time', () => {
    expect(windowPaths(grid)).toEqual(windowPaths(grid));
    expect(hash(7, 3)).toBe(hash(7, 3));
    expect(hash(7, 3)).toBeGreaterThanOrEqual(0);
    expect(hash(7, 3)).toBeLessThan(1);
  });
  it('lights none or all at the ends', () => {
    expect(windowPaths({ ...grid, lit: 0 }).lit).toBe('');
    expect(windowPaths({ ...grid, lit: 1 }).glass).toBe('');
  });
});

describe('palette', () => {
  it('has the same keys for every time of day', () => {
    const keys = Object.keys(SKY_PALETTES.day).sort();
    expect(Object.keys(SKY_PALETTES.night).sort()).toEqual(keys);
    expect(Object.keys(SKY_PALETTES.dusk).sort()).toEqual(keys);
    expect(Object.keys(SKY_VARS).sort()).toEqual(keys);
  });
  it('writes every key as a custom property, for day, night and the three fixed times', () => {
    const css = skylineCss();
    expect(css).toContain(`--k-skilF:${SKY_PALETTES.day.skilF}`);
    expect(css).toContain(`--k-skilF:${SKY_PALETTES.night.skilF}`);
    expect(css).toContain('@media (prefers-color-scheme:dark)');
    expect(css).toContain('.k-dusk{');
    expect(SKY_VARS.sun).toBe('var(--k-sun)');
  });
});

describe('types', () => {
  it('names all ten pairs once', () => {
    expect(TYPES).toHaveLength(10);
    expect(new Set(TYPES.map((t) => t.pair.join('+'))).size).toBe(10);
    expect(new Set(TYPES.map((t) => t.name)).size).toBe(10);
  });
  it('finds a pair in either order', () => {
    expect(typeForPair('BODY', 'SKIL')?.name).toBe(typeForPair('SKIL', 'BODY')?.name);
    expect(typeForPair('SKIL', 'SKIL')).toBeNull();
  });
  it('takes the two highest sectors', () => {
    expect(typeForPrices({ SKIL: 111.2, WLTH: 96.85, NETW: 103.4, BODY: 108.1, MIND: 102.3 })?.pair).toEqual(['SKIL', 'BODY']);
    expect(typeForPrices({ SKIL: 100, WLTH: null })).toBeNull();
    expect(typeForPrices({ SKIL: 100, WLTH: 100, NETW: 100 })?.pair).toEqual(['SKIL', 'WLTH']);
  });
  it('follows the copy rules', () => {
    for (const t of TYPES) {
      expect(t.line).not.toMatch(/[—!]/);
      expect(t.name).not.toMatch(/[—!]/);
    }
  });
});
