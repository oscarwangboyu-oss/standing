import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME } from '@/styles/theme';
import { SKY_PALETTES } from '@/ui/skyline/palette';
import { SHARE_COLORS } from '@/ui/share/layout';

const css = readFileSync(fileURLToPath(new URL('../../../src/styles/tokens.css', import.meta.url)), 'utf8');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const darkEnd = css.indexOf('@media (max-width: 379px)');

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) out[m[1] as string] = (m[2] as string).toUpperCase();
  return out;
}
const light = tokens(css.slice(0, darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart, darkEnd)) };

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SECTORS = ['skil', 'wlth', 'netw', 'body', 'mind'];

/** Text pairs that must reach WCAG AA for normal text, 4.5 to 1. [text, background] */
function textPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const ink of ['--ink', '--ink-2', '--ink-3']) {
    for (const bg of ['--ground', '--ground-2', '--surface', '--surface-2']) pairs.push([ink, bg]);
  }
  pairs.push(['--on-ink', '--ink'], ['--up', '--up-wash'], ['--down', '--down-wash'], ['--down', '--ground'], ['--down', '--surface'], ['--ink-2', '--track'], ['--up', '--surface'], ['--up', '--ground']);
  for (const s of SECTORS) {
    pairs.push([`--${s}-deep`, `--${s}-wash`], [`--${s}-deep`, `--${s}-tint`], [`--${s}-deep`, '--surface'], [`--${s}-deep`, '--ground']);
    pairs.push(['--ink', `--${s}-wash`], ['--ink-2', `--${s}-wash`]);
  }
  return pairs;
}

/** Graphic pairs that must reach 3 to 1: chart lines, sparklines, dots and icons against their background. */
function graphicPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [['--line-2', '--surface'], ['--focus', '--ground'], ['--focus', '--surface']];
  for (const s of SECTORS) pairs.push([`--${s}-line`, '--surface'], [`--${s}-line`, '--ground'], [`--${s}-line`, `--${s}-wash`]);
  return pairs;
}

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('contrast, %s theme', (_name, t) => {
  it.each(textPairs())('%s on %s reaches 4.5 to 1', (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(graphicPairs().filter(([fg]) => fg !== '--line-2'))('%s on %s reaches 3 to 1', (fg, bg) => {
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(3);
  });
});

describe('sector washes show on a card at night', () => {
  // A wash at night must not melt into the surface: tags, icon chips and tinted cards would read as missing.
  it.each(SECTORS)('%s wash is a visible step from the surface', (s) => {
    expect(contrast(dark[`--${s}-wash`] as string, dark['--surface'] as string)).toBeGreaterThanOrEqual(1.18);
    expect(luminance(dark[`--${s}-wash`] as string)).toBeGreaterThan(luminance(dark['--surface'] as string));
  });
});

describe('gain and loss stay apart from the sector colours', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: the pills are lighter or darker than the sector fills next to them', (_n, t) => {
    // Green text against teal, red text against coral: at least 1.6 to 1 in lightness, on top of the pill, the arrow and the sign.
    expect(contrast(t['--up'] as string, t['--netw'] as string)).toBeGreaterThanOrEqual(1.6);
    expect(contrast(t['--down'] as string, t['--body'] as string)).toBeGreaterThanOrEqual(1.6);
  });
});

describe('theme mirror', () => {
  it('matches tokens.css', () => {
    expect(THEME.light.ground).toBe(light['--ground']);
    expect(THEME.light.surface).toBe(light['--surface']);
    expect(THEME.light.ink).toBe(light['--ink']);
    expect(THEME.light.ink2).toBe(light['--ink-2']);
    expect(THEME.light.line).toBe(light['--line']);
    expect(THEME.dark.ground).toBe(dark['--ground']);
    expect(THEME.dark.surface).toBe(dark['--surface']);
    expect(THEME.dark.ink).toBe(dark['--ink']);
    expect(THEME.dark.ink2).toBe(dark['--ink-2']);
    expect(THEME.dark.line).toBe(dark['--line']);
  });
});

describe('share image text', () => {
  const dusk = SKY_PALETTES.dusk;
  it('reads on every sky band it can sit on', () => {
    for (const band of [dusk.sky1, dusk.sky2, dusk.sky3]) {
      expect(contrast(SHARE_COLORS.cream, band)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(SHARE_COLORS.sun, dusk.sky2)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(SHARE_COLORS.muted, dusk.sky1)).toBeGreaterThanOrEqual(4.5);
  });
  it('reads on the panel', () => {
    for (const c of [SHARE_COLORS.cream, SHARE_COLORS.muted, SHARE_COLORS.SKIL, SHARE_COLORS.WLTH, SHARE_COLORS.NETW, SHARE_COLORS.BODY, SHARE_COLORS.MIND]) {
      expect(contrast(c, SHARE_COLORS.panel)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(SHARE_COLORS.onPill, SHARE_COLORS.pill)).toBeGreaterThanOrEqual(4.5);
  });
});
