import { describe, expect, it } from 'vitest';
import { PENTAGON, coord, pentagonRadius, pentagonShape, pentagonVertex, polylinePoints, priceDomain, sharedDomain, valueAt, xByDay, xByIndex, yFraction } from '@/ui/charts/scale';
import { openClipRight, openProgress, openValue } from '@/ui/motion/open';

const HISTORY = [100.0, 98.2, 99.4, 101.1, 100.6, 102.2, 103.25, 104.37];

describe('price domain', () => {
  it('covers the sample history and 100 in at most three intervals', () => {
    const d = priceDomain(HISTORY);
    expect(d.ticks).toEqual([95, 100, 105]);
    expect(d.min).toBe(95);
    expect(d.max).toBe(107);
  });
  it('always keeps 100 as a tick', () => {
    for (const values of [[100], [131, 140], [58, 61], [99.9, 100.1], []]) {
      expect(priceDomain(values).ticks).toContain(100);
    }
  });
  it('puts the top of the domain at 0 and the bottom at 1', () => {
    const d = { min: 90, max: 110 };
    expect(yFraction(110, d)).toBe(0);
    expect(yFraction(100, d)).toBe(0.5);
    expect(yFraction(90, d)).toBe(1);
  });
});

describe('x positions', () => {
  it('spaces records evenly', () => {
    expect(xByIndex(3)).toEqual([0, 0.5, 1]);
    expect(xByIndex(1)).toEqual([1]);
    expect(xByIndex(0)).toEqual([]);
  });
  it('spaces days by the calendar', () => {
    expect(xByDay(['2026-10-01', '2026-10-02', '2026-10-05'])).toEqual([0, 0.25, 1]);
  });
  it('falls back to even spacing when days do not parse', () => {
    expect(xByDay(['a', 'b', 'c'])).toEqual([0, 0.5, 1]);
  });
});

describe('lines', () => {
  it('writes polyline points in the viewBox', () => {
    expect(polylinePoints([0, 1], [100, 110], { min: 90, max: 110 }, 200, 100)).toBe('0,50 200,0');
  });
  it('trims coordinates', () => {
    expect(coord(147.5049)).toBe('147.5');
    expect(coord(-0.001)).toBe('0');
  });
  it('interpolates the value at a position on the line', () => {
    expect(valueAt([0, 1], [100, 104], 0.5)).toBe(102);
    expect(valueAt([0, 1], [100, 104], 2)).toBe(104);
  });
  it('shares one domain between sparklines and includes 100', () => {
    const d = sharedDomain([[104, 111.2], [99.5, 96.85]]);
    expect(d.min).toBeLessThan(96.85);
    expect(d.max).toBeGreaterThan(111.2);
    const flat = sharedDomain([[100, 100]]);
    expect(flat.max - flat.min).toBeGreaterThan(1);
  });
});

describe('pentagon', () => {
  it('puts 70 at the centre and 130 at the rim', () => {
    expect(pentagonRadius(70)).toBe(0);
    expect(pentagonRadius(130)).toBe(PENTAGON.radius);
    expect(pentagonRadius(145)).toBe(PENTAGON.radius);
    expect(pentagonRadius(100)).toBe(PENTAGON.radius / 2);
  });
  it('starts at the top and goes clockwise', () => {
    const top = pentagonVertex(0, 130);
    expect(top.x).toBeCloseTo(PENTAGON.cx);
    expect(top.y).toBeCloseTo(PENTAGON.cy - PENTAGON.radius);
    expect(pentagonVertex(1, 130).x).toBeGreaterThan(PENTAGON.cx);
  });
  it('leaves out sectors without a price', () => {
    expect(pentagonShape([110, null, 100, 95, 105]).count).toBe(4);
  });
});

describe('the open', () => {
  it('starts at the issue price and lands on the last price', () => {
    expect(openValue(HISTORY, 0)).toBe(100);
    expect(openValue(HISTORY, 1)).toBe(104.37);
    expect(openValue([108], 0.5)).toBe(104);
  });
  it('waits for the delay, then runs for the duration', () => {
    expect(openProgress(100, 250, 1600)).toBe(0);
    expect(openProgress(1050, 250, 1600)).toBe(0.5);
    expect(openProgress(5000, 250, 1600)).toBe(1);
  });
  it('clips the undrawn share of the line', () => {
    expect(openClipRight(0)).toBe(100);
    expect(openClipRight(0.25)).toBe(75);
    expect(openClipRight(1)).toBe(0);
  });
});
