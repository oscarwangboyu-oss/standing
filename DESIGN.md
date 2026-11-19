# Standing design system

This is a new identity made for the product. It takes nothing from the roadmap deck. The reference mock it was built from is in `design/mocks/board/` (static HTML, not shipped): open those files when a rule here is unclear, and match them.

The bar is a designer's own site or a finished product site: one confident idea, large type, exact spacing, nothing decorative. Patterns come from apps the audience already uses: a quote head and sparkline rows like a stocks app, giant numerals, bottom navigation within thumb reach, bottom sheets for detail, a share image worth posting, a streak for the daily habit.

**The idea: the price is the hero.** Zinc paper, blue-black ink, a fine grain. The only colour on screen is information: green for up, red for down, and one blue reserved for the 100 baseline and for keyboard focus. The interface is English only.

## 1. Colour tokens

Chroma is information. Nothing decorative is coloured.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#E4E5E6` zinc | `#17191B` slate | Page background |
| `--paper-2` | `#D7D9DB` | `#212427` | Recessed surface (reserved, not used on these five screens) |
| `--ink` | `#111315` | `#E9EAEA` | Text, prices, bars, primary button fill, strong rules |
| `--ink-2` | `#454B51` | `#A3A9AE` | Secondary text, captions, tag outline |
| `--rule` | `#B4B8BB` | `#3A3F43` | Hairlines between rows. Decorative only, never carries meaning alone |
| `--up` | `#055A39` | `#45C68A` | Gain, always with an up triangle and a plus sign |
| `--down` | `#9E1C16` | `#FF7466` | Loss, always with a down triangle and a minus sign |
| `--ref` | `#1B31C9` | `#93A5FF` | The 100 baseline (chart line, bar tick, pentagon ring, the figure 100) and the focus ring. Nothing else |

The dark band (`.band`, used once on the landing) is always dark and redefines the same names, so every component inside adapts without extra rules.

| Token | Light theme band | Dark theme band |
|---|---|---|
| background | `#111315` | `#050506` |
| ink / ink-2 / rule | `#E9EAEA` / `#A3A9AE` / `#3A3F43` | same |
| up / down / ref | `#45C68A` / `#FF7466` / `#93A5FF` | same |

Grain: an inline SVG `feTurbulence` tile (200px, `baseFrequency 1.7`, 2 octaves) as a `background-image` on `body`, `.band`, the sticky bars and the share card. Black specks on light paper, white specks on dark. It is a data URI, so there is no network request. It is a background layer, so text is never filtered.

Contrast (WCAG 2 ratio, computed by `audit.mjs`). "Grain mean" is the average colour of an empty patch measured from pixels, "worst" is the darkest 2 percent of pixels on light surfaces and the lightest 2 percent on dark ones.

| Surface | Token | Flat | Grain mean | Worst |
|---|---|---|---|---|
| Light paper `#E4E5E6` (mean `#D9DADB`) | ink | 14.76 | 13.26 | 10.77 |
| | ink-2 | 7.00 | 6.29 | 5.11 |
| | up | 6.59 | 5.91 | 4.81 |
| | down | 6.33 | 5.68 | 4.62 |
| | ref | 7.15 | 6.42 | 5.22 |
| Dark paper `#17191B` (mean `#1F2123`) | ink | 14.62 | 13.36 | 10.80 |
| | ink-2 | 7.42 | 6.78 | 5.48 |
| | up | 8.14 | 7.44 | 6.01 |
| | down | 6.67 | 6.09 | 4.92 |
| | ref | 7.61 | 6.95 | 5.62 |
| Band, light theme `#111315` | ink-2 / up / down / ref | 7.84 / 8.60 / 7.04 / 8.04 | 7.24 / 7.94 / 6.50 / 7.42 | 5.90 / 6.47 / 5.30 / 6.05 |
| Band, dark theme `#050506` | ink-2 / up / down / ref | 8.58 / 9.41 / 7.70 / 8.80 | 8.12 / 8.90 / 7.29 / 8.32 | 6.94 / 7.61 / 6.23 / 7.11 |

Primary button label (paper on ink): 14.76 light, 14.62 dark. The fact on the right of the button is the label colour at 74 percent opacity: 8.39 light, 6.80 dark.

## 2. Type

One family: Archivo Variable, self-hosted.

- File: `node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2` (90 KB, latin subset, upright).
- Axes used: `wght` 100 to 900 and `wdth` 62 to 125, through `font-weight` and `font-stretch`.
- Declared once, with the full latin range.
- `font-variant-numeric: tabular-nums lining-nums` on `body`. Archivo has real tabular figures at every width (checked: every digit is 0.4295em at width 62, weight 800).

Width is the hierarchy. This replaces a second typeface.

| Role | `font-stretch` | Weight | Tracking | Used for |
|---|---|---|---|---|
| Price (`.fig`) | 62% | 800 hero, 700 in rows | -0.02em | Every price and large figure |
| Caption | 88% | 400 | 0 | Strip labels on narrow phones |
| Text | 100% | 400 body, 600 to 650 headings | -0.02em to -0.03em on headings | Language |
| Code (`.code`) | 112% | 700 | +0.02em | Ticker codes: RIVR, SKIL, WLTH, NETW, BODY, MIND |

Scale (rem tokens `--t-12` to `--t-64`, 16px root)

| Token | px | Used for |
|---|---|---|
| `--t-12` | 12 | Smallest captions, scale labels, tags |
| `--t-13` | 13 | Captions, cohort line, footer |
| `--t-15` | 15 | Row text, notes, secondary buttons |
| `--t-17` | 17 | Body, primary button label |
| `--t-21` | 21 | Ticker in quote head, block titles |
| `--t-28` | 28 | Section headings on phone, row prices, strip values |
| `--t-40` | 40 | Section headings on desktop, row prices on desktop |
| `--t-64` | 64 | Reserved |
| hero price | `min(44.2cqw, 25rem)` | The overall price. "104.37" is 2.24em wide at width 62, weight 800, tracking -0.02em, so 44.2 percent of the container width fills the row. About 145px on a 360 phone, 371px in the desktop column |

Line height: 1.45 body, 1.1 to 1.2 headings, 0.8 on prices.

## 3. Spacing, radius, lines

- Spacing: 4px base. `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-6` 24, `--s-8` 32, `--s-12` 48, `--s-18` 72. Page gutter 16. Section gap 72 on phone, 120 on desktop.
- Radius: 0 everywhere. The only round shapes are data points (chart dot, pentagon vertices).
- Lines encode rank. A 2px ink rule opens a table or a block. A 1px `--rule` hairline separates rows. A 1px ink outline means the thing can be pressed (answer options, secondary buttons, the Daily open block). A solid ink slab is the primary action.
- No shadows, no gradients, no cards.
- Tap targets: 44px minimum. Primary button 56, answer options 64, rows 64 to 68, tab bar 56.
- App screens are a single column capped at 560px and centred. The landing is capped at 1344px.

## 4. Signature element

The price, set in extra-condensed 800 so that six characters fill the width of the screen, and the blue par line that runs under it through the product. 100 is always the same blue: the chart baseline, the tick in every position bar, the ring in the pentagon, the line through the five rows of the share card, the figure in the provisional-baseline note. Blue never means anything else except focus.

Supporting vernacular: ticker codes in the expanded width, rows with hairlines, a fact set on the right of each primary button ("31 to 34 questions", "1080 x 1350", "3 questions, 15 seconds").

## 5. Motion

One moment, "the open". On first paint of the landing and the result page the price starts at the issue price 100.00 and replays its history (100.00, 98.20, 99.40 ... 104.37) while the chart line draws from left to right in step with it. 250ms delay, 1600ms, cubic ease-out. The change line and the end dot appear when it lands. The number and the line are driven by the same `requestAnimationFrame` loop, so the figure always matches the tip of the line.

Everything else is response to touch: buttons shift 1px on press, answer options invert, the phone action bar on the landing slides in (180ms) once the first button has left the screen.

`prefers-reduced-motion: reduce`: the open does not run and all transitions are off. Screenshots are taken in this mode, except `landing-390-light-en-motion.png`, which is a frame 1000ms into the open.

## 6. Layout

```
Phone landing                     Desktop landing (1000px and up)
+----------------------------+    +-----------+------------------------------------+
| Standing                   |    | Standing  | RIVR                  Sample quote |
| RIVR         Sample quote  |    |           | 104.37  (fills the column)         |
| 104.37  (fills the width)  |    |           | up +1.12 (+1.08%)                  |
| up +1.12 (+1.08%)          |    |           | issue | high | low | grade         |
| issue | high | low | grade |    | (sticky,  | chart with the blue 100 line       |
| One sentence of pitch      |    |  100vh)   | five sector rows with bars         |
| [ Start the check    31-34]|    |           | [dark band: how a price is read]   |
| chart                      |    | pitch     | how a check works + real question  |
| five sector rows           |    | sentence  | after the first check              |
| [dark band, full bleed]    |    | [ Start ] | what is collected                  |
| how a check works ...      |    | note      | what a price is, footer            |
+----------------------------+    +-----------+------------------------------------+
```

- Landing DOM order is pitch, sample quote, rest. On phone the pitch wrapper is `display: contents` and `order` puts the quote first. On desktop the pitch is a sticky 328px column and the board scrolls in the second column.
- Question: progress tape and sector label at the top, question and answers together at the bottom of the screen, within thumb reach. From 700px wide the block sits under the header instead.
- Position bars use a 70 to 130 track (two standard deviations each way) so typical prices are legible. Prices beyond it stop at the edge. The ruler on the landing shows the full 55 to 145 range.

## 7. Implementation rules (Next.js, React, CSS variables)

1. Tokens live in `src/styles/tokens.css` on `:root`, the dark set under `@media (prefers-color-scheme: dark)`. Components read `var(--ink)` and friends and never a hex value, because `.band` works by redefining the same names on a subtree.
2. Fonts: one `@font-face` in `src/styles/fonts.css` pointing at `@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2` (the file with both the weight and the width axis), `font-display: swap`. No remote fonts and no `next/font/google`.
3. Three text primitives carry every number and code: `<Price value />` (always `toFixed(2)`), `<Ticker code />`, `<Change value pct? />`. `Change` renders an inline SVG triangle, the sign (U+2212 for minus), the colour, and a visually hidden "up" or "down". Zero change renders in ink with no triangle.
4. Hero price: the parent has `container-type: inline-size`, the price uses `font-size: min(44.2cqw, 25rem)`. Do not fit text with JavaScript.
5. `PositionBar({ value })` sets `--v` inline and CSS does the rest (`clamp(70, v, 130)`). The bar is ink, never green or red: position against the issue price is not a change.
6. Charts are hand-written SVG. `PriceChart`: grid and the blue 100 line in one SVG, the price line in another so it can be clipped during the open, `preserveAspectRatio="none"` with `vector-effect: non-scaling-stroke`; axis labels and the end dot are HTML positioned in percent. It also draws a vertical marker on days when the algorithm, bank or norm version changed, and marks full checks. `Sparkline` uses one shared y-domain for the five sectors. `Pentagon` has 70 at the centre and 130 at the rim with rings every 15 points.
7. Grain is a background image (inline SVG `feTurbulence` data URI) on `body` and on any element that paints its own opaque background. Never a fixed overlay with a blend mode.
8. Focus: `:focus-visible { outline: 2px solid var(--ref); outline-offset: 2px }`.
9. States: the mind notice sits above the quote head as a note with a 2px ink rule and no colour. "First record, no change yet" replaces the change line in `--ink-2`. A sector without a price shows "Not enough data" and an empty track; a sector excluded by consent shows "Not listed". Halted is an outline tag; limit up and limit down are solid tags. MIND is never tagged laggard while the mind notice shows.
10. The share image is one component sized in `cqw`, rendered at 1080 x 1350. It contains the ticker, the overall price, five sector prices and the type. No cohort, no change, no answers.
11. App screens are a single column capped at 560px and centred. The public pages are capped at 1344px with a sticky left column on desktop.
12. Motion: only "the open" described in section 5, plus direct response to touch. Honour `prefers-reduced-motion`.
13. Server components by default; add `'use client'` only where state or effects are needed.

## 8. Patterns added to the mock

- **Bottom sheet**: secondary detail (why a price moved, a sector's breakdown, the share options) opens in a sheet from the bottom on phones and a centred panel from 700px. One sheet at a time, closes on Escape and on backdrop tap, focus is trapped and returned.
- **Bottom navigation**: text labels only, 56px high, the current item marked with a 2px ink rule above it. Market, Open, Log, Settings.
- **Streak**: seven day cells, filled ink for a recorded day, outlined for a missed one, today outlined in blue until recorded. Never a flame, never a number in a badge.
- **Compare**: two quote heads side by side on desktop and stacked on phone, then five rows with both prices and the difference in ink. No winner label.
- **Dashboard** (`/team`): the same tokens, denser. Tables with 1px rules, numbers right-aligned in tabular figures, a red-line breach shown as a solid ink tag with the word, never colour alone.
- **Forms** (payday numbers, ticker, recovery code): a 1px ink outline, 56px high, label above in `--t-13`, error text below in ink with a 2px ink rule on the left.
- **Empty and error states** say what happened and what to do next, in the interface voice.
