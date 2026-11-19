import { describe, expect, it } from 'vitest';
import { daysBetween, direction, formatChange, formatDay, formatPercent, formatPrice, percentChange, positionBar, positionFraction, round2, rulerFraction } from '@/ui/format';

describe('prices', () => {
  it('always shows two decimals', () => {
    expect(formatPrice(100)).toBe('100.00');
    expect(formatPrice(104.369)).toBe('104.37');
    expect(formatPrice(96.85)).toBe('96.85');
  });
  it('rounds half away from zero without binary noise', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-0.001)).toBe(0);
  });
});

describe('changes', () => {
  it('carries a sign, and a true minus for a loss', () => {
    expect(formatChange(1.12)).toBe('+1.12');
    expect(formatChange(-0.75)).toBe('−0.75');
    expect(formatChange(0.004)).toBe('0.00');
    expect(formatPercent(1.08)).toBe('+1.08%');
  });
  it('reads direction after rounding', () => {
    expect(direction(0.004)).toBe('flat');
    expect(direction(0.005)).toBe('up');
    expect(direction(-2)).toBe('down');
  });
  it('gives no percent without a previous price', () => {
    expect(percentChange(104.37, 0)).toBeNull();
    expect(percentChange(104.37, 103.25)).toBeCloseTo(1.0847, 3);
  });
});

describe('positions', () => {
  it('puts 100 in the middle of the 70 to 130 track and stops at the ends', () => {
    expect(positionFraction(100)).toBe(0.5);
    expect(positionFraction(55)).toBe(0);
    expect(positionFraction(145)).toBe(1);
  });
  it('draws the bar from 100 to the price', () => {
    expect(positionBar(115)).toEqual({ left: 0.5, width: 0.25 });
    expect(positionBar(85)).toEqual({ left: 0.25, width: 0.25 });
  });
  it('maps the full scale for the ruler', () => {
    expect(rulerFraction(55)).toBe(0);
    expect(rulerFraction(100)).toBe(0.5);
    expect(rulerFraction(145)).toBe(1);
  });
});

describe('days', () => {
  it('formats a day from its text, without a time zone', () => {
    expect(formatDay('2026-10-01')).toBe('Oct 1');
    expect(formatDay('not a day')).toBe('not a day');
  });
  it('counts days on the calendar', () => {
    expect(daysBetween('2026-10-29', '2026-11-05')).toBe(7);
  });
});
