/**
 * Glyph metrics of the two faces, so the share layout can measure text without a canvas: it
 * stays pure and runs the same in a unit test, on the server and in the browser.
 *
 * Measured in Chrome with canvas measureText at 1000px, from the bundled fonts
 * (src/styles/fonts.css), with tabular lining figures as the faces declare them. Kerning is
 * left out, which errs on the wide side for most pairs.
 */

/** Advance widths of the printable ASCII characters, U+0020 to U+007E, per 1000 units of size. */
const TEXT_500 =
  '260,244,347,697,560,743,691,180,240,240,398,560,240,327,240,419,560,560,560,560,560,560,560,560,560,560,240,240,560,560,560,516,874,649,604,706,679,583,563,732,683,252,553,644,498,845,680,748,557,778,603,568,586,656,661,964,651,610,590,272,454,272,577,434,299,542,583,519,583,540,339,517,553,232,232,541,269,833,553,575,583,583,413,471,353,553,526,750,527,526,472,254,262,254,560';
const DISPLAY_750 =
  '204,260,329,608,573,942,694,170,297,298,446,486,186,311,235,346,578,578,578,578,578,578,578,578,578,578,239,226,486,486,486,396,926,653,605,630,620,538,510,648,635,237,320,618,458,816,689,660,583,659,611,583,514,626,628,912,616,589,547,292,346,292,528,537,283,538,572,536,572,535,370,549,557,228,237,535,228,855,557,566,570,570,393,514,363,553,528,795,536,536,478,321,214,323,486';

const table = (csv: string) => csv.split(',').map(Number);
const ADVANCE = { text: table(TEXT_500), display: table(DISPLAY_750) } as const;

/** Width of a character outside the table: about an average lowercase letter. */
const FALLBACK = 560;
/**
 * How much narrower each width keyword sets the display face. Semi-condensed was measured (a
 * digit is 494 against 578); condensed is the same ratio again, rounded up.
 */
export const STRETCH_FACTOR = { normal: 1, 'semi-condensed': 0.86, condensed: 0.76 } as const;
/** Heavier weights than the measured ones are a little wider. */
const WEIGHT_ALLOWANCE = 1.02;
/**
 * The display face has an optical size axis that follows the font size up to 96px. Below that
 * its letters get wider: measured, 0.155% to 0.165% per px under 96 (Standing at 36px is 9.3%
 * wider than at 96px). The text face has no such axis.
 */
const OPTICAL = { from: 96, perPx: 0.00165 } as const;

/** Vertical metrics, as a share of the font size. */
export const VERTICAL = {
  display: {
    /** Capitals and ascenders reach this high above the baseline. */
    ascent: 0.715,
    /** Figures alone are shorter than the capitals of the face. */
    figures: 0.675,
    descent: 0.165,
  },
  text: { ascent: 0.711, figures: 0.708, descent: 0.215 },
  /** Round letters and figures dip this far below the baseline. */
  overshoot: 0.015,
} as const;

export type Family = 'display' | 'text';
export type Stretch = keyof typeof STRETCH_FACTOR;

/** The width of a line of text in px, from the advance tables. */
export function measureText(text: string, size: number, family: Family, stretch: Stretch = 'normal', weight = 500): number {
  const adv = ADVANCE[family];
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code >= 32 && code <= 126 ? (adv[code - 32] as number) : FALLBACK;
  }
  const heavier = family === 'text' ? weight > 500 : weight > 750;
  const optical = family === 'display' ? 1 + OPTICAL.perPx * Math.max(0, OPTICAL.from - size) : 1;
  return (units / 1000) * size * STRETCH_FACTOR[stretch] * (heavier ? WEIGHT_ALLOWANCE : 1) * optical;
}

const DESCENDERS = /[gjpqyQ,;()[\]{}|/_@$]/;
const FIGURES_ONLY = /^[0-9.,\s−+-]+$/;

/** How far a line of text reaches above and below its baseline, in px. */
export function verticalExtent(text: string, size: number, family: Family): { above: number; below: number } {
  const v = VERTICAL[family];
  const above = (FIGURES_ONLY.test(text) ? v.figures : v.ascent) * size;
  const below = (DESCENDERS.test(text) ? v.descent : VERTICAL.overshoot) * size;
  return { above, below };
}
