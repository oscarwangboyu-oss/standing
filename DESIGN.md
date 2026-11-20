# Skyline

The design system of Standing. The code is in `src/styles` (tokens), `src/ui` (components), `src/copy/common.ts` and `src/copy/types.ts` (text). Every part is shown in its states at `/styleguide`, with five reference screens at the end. Screens are built from these parts and copy the reference screens.

This document replaces the earlier monochrome design. Nothing from it remains.

## 1. The idea

Standing shows where you stand, drawn as your own city.

- Five towers, one per sector, always in sector order: SKIL, WLTH, NETW, BODY, MIND.
- The street is the base of every tower. One floor is five points. **The horizon is 100**, the median of people like you: it is the line where the sky meets the bay behind the city. A tower above 100 crosses the horizon. A tower below 100 stays under it.
- A tower's roof line is its price, on one linear scale from 55 to 145. Cranes, domes and flags stand above the roof line and carry no value.
- A short tower is a complete, well-drawn building. A price of 55 is still a workshop, a bank, a pair of towers. Nothing in the picture mocks a low price.

The skyline is the identity. It appears on the landing page (large, rising once), in the check (the progress indicator), on the result (revealed, then the numbers), on the market home (small), on the share image (at dusk), in the compare view (two side by side) and in empty states.

What makes it feel finished: a warm ground, deep ink, one confident hue per sector, a characterful display face for headings and prices, generous radii, soft layered shadows, and one illustration language used everywhere.

## 2. Colour

Tokens are in `src/styles/tokens.css`. The light theme is day, the dark theme is night, chosen by `prefers-color-scheme`. There is no manual switch.

### Neutrals

| Token | Day | Night | Use |
|---|---|---|---|
| `--ground` | `#FAF6EE` | `#0B1024` | The page. Warm near-white by day, deep blue-black by night. Never grey. |
| `--ground-2` | `#F2ECDF` | `#131A37` | A sunk area: notes, quiet cards, the sunk band. |
| `--surface` | `#FFFFFF` | `#182043` | Cards, sheets, the navigation. |
| `--surface-2` | `#FCF9F3` | `#1E2850` | A quiet area or a hover inside a card. |
| `--ink` | `#141A31` | `#F5F1E8` | Text and the primary action. |
| `--ink-2` | `#474E68` | `#B8BED6` | Secondary text. |
| `--ink-3` | `#5F6680` | `#9299B8` | Captions, axis labels. Still AA on every ground. |
| `--line` | `#E7E0D1` | `#283262` | Hairlines. |
| `--line-2` | `#CFC6B2` | `#3F4C8C` | The border of a control. |
| `--track` | `#ECE5D5` | `#262F60` | The empty part of a bar or a scale, skeleton blocks. |
| `--on-ink` | `#FAF6EE` | `#0B1024` | Text on an ink fill. |
| `--focus` | `#1D4FD8` | `#A9C0FF` | The focus ring. |

### Sector ramps

Each sector owns a hue with five steps. Use them through `sectorStyle(code)` from `@/ui`, which sets `--sector`, `--sector-deep`, `--sector-tint`, `--sector-wash` and `--sector-line` on an element; components inside pick them up.

| Sector | Hue | deep | base | tint | wash | line |
|---|---|---|---|---|---|---|
| SKIL Capability | cobalt | `#1B348F` | `#2E5CE6` | `#BCCDFA` | `#E9EFFD` | `#2E5CE6` |
| WLTH Wealth | amber-gold | `#744900` | `#E9A829` | `#F7DC9B` | `#FCF2DA` | `#AD7200` |
| NETW Network | teal | `#095C57` | `#14A398` | `#A6E0D9` | `#DFF5F2` | `#0E8A80` |
| BODY Body | coral | `#A12F1A` | `#F26B4B` | `#FAC3B4` | `#FEEBE4` | `#DA4F34` |
| MIND Mind | violet | `#5230A8` | `#8558E3` | `#D0BFF6` | `#F0EAFC` | `#8558E3` |

Night values are in the tokens file: deep becomes the light text step, wash the dark tinted ground.

- **deep**: text in the sector colour (tickers, tags). AA on wash, tint, surface and ground.
- **base**: fills. Position bars, the chosen ring of an option, icon chips. A base fill is never the only carrier of a value: the number is next to it.
- **tint** and **wash**: backgrounds. Wash for tags, bands and tinted cards; tint for emblems.
- **line**: the base, darkened where needed so a thin stroke reaches 3 to 1 on every ground. Chart lines, sparklines, end dots and pentagon corners use it.

### Gain and loss

`--up` on `--up-wash` (green) and `--down` on `--down-wash` (red). A gain or a loss is **always the `Change` pill**: an arrow, a sign, the figure, and a hidden word ("up", "down") for screen readers. Never colour alone, and never green or red as a text colour outside the pill, except the Limit up and Limit down tags and a field error.

This keeps gains and losses apart from the coral and teal sectors: the pill has a triangle and digits, a sector tag has a building glyph and letters; by day the pill text is much darker than the sector fills (crimson `#BF2130` against coral `#F26B4B`), by night much lighter. `tests/unit/ui/theme.test.ts` checks the lightness gap.

### Contrast

Computed in `tests/unit/ui/theme.test.ts` for both themes, from the tokens file itself: every ink on every ground and surface, sector text on its wash and tint, pill text on its wash, text on ink, at 4.5 to 1 or better; sector lines and the focus ring at 3 to 1 or better; the share image text on every sky band it can sit on. Change a token and the test tells you what broke.

## 3. Type

Two families, self-hosted from `node_modules` (`src/styles/fonts.css`). No remote fonts.

- **Bricolage Grotesque** (variable: weight 200 to 800, width 75 to 100, optical size): headings, the wordmark, tickers, buttons, every price. Its default figures are proportional, so the face is declared with tabular lining figures (`font-feature-settings: "tnum", "lnum"` in the `@font-face`). Measured in Chrome: all digits 0.56em wide. Prices line up in columns, on a canvas too.
- **Hanken Grotesk** (variable weight): text. Tabular figures by default.

Roles are classes in `src/styles/base.css`:

| Class | Size | Use |
|---|---|---|
| `.t-display` | 40 to 76px, 700, width 88 | The largest heading of a public page |
| `.t-h1` | 30 to 42px, 700 | The heading of a screen |
| `.t-h2` | 24px, 700 | The heading of a section |
| `.t-h3` | 20px, 650 | The heading of a card |
| `.t-lead` | 20px | A lead paragraph |
| `.t-body` | 17px | Body text |
| `.t-small` | 15px | A second line under a title |
| `.t-caption` | 13px | Axis labels, footnotes |
| `.t-label` | 13px, 600 | A small label above a value. Sentence case, never spaced capitals |
| `.t-figure` | inherits | Any figure that is a price, outside the `Price` component |

Headings are large and tight (`letter-spacing` -0.02 to -0.045em). Prices always show two decimals. `Price` sets the decimals smaller so the whole number reads first; a screen reader hears one number. The only upper-case text is ticker codes.

## 4. Space, shape, depth

- **Space**: a 4px step. `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 20, `--s-6` 24, `--s-8` 32, `--s-10` 40, `--s-12` 48, `--s-16` 64, `--s-20` 80. Inside a card 20 to 24. Between cards of one group 12 to 16. Between sections of an app screen 40. Between sections of a public page 64 to 80.
- **Gutter**: `--gutter` is 20px, 16px under 380px wide.
- **Columns**: `--col` 560px for app screens, `--wide` 1120px for public pages and the split desktop layout.
- **Radius**: `--r-sm` 10, `--r-md` 16 (notes, fields, small cards), `--r-lg` 22 (cards), `--r-xl` 28 (large cards, the skyline, sheets, the dock), `--r-pill` for every action and tag.
- **Shadows**: three layered steps tinted with the ink, tuned per theme. `--shadow-1` for a resting control, `--shadow-2` for a raised card, `--shadow-3` for sheets, the dock, toasts and the share card. At night shadows are stronger and raised surfaces also get a 1px light edge (`--edge`).
- **Tap targets**: `--tap` is 44px. No control is smaller. Every button, link and radio in the styleguide was measured at 360px wide.
- **Focus**: one ring everywhere, 3px `--focus` with a 3px gap.

## 5. The illustration system

Code in `src/ui/skyline/`. Everything is inline SVG built by React from the five prices. There are no image files and no icon library.

### Scale (`geometry.ts`, pure, tested)

| Constant | Value | Meaning |
|---|---|---|
| `SCENE_W` × `SCENE_H` | 440 × 300 | The scene in units |
| `GROUND_Y` | 262 | The street |
| `PODIUM` | 20 | Height every tower has at a price of 55 |
| `PER_POINT` | 2.3 | Height per point above 55 |
| `FLOOR` | 11.5 | One floor: five points |
| `HORIZON_Y` | 138.5 | Where a price of 100 ends |
| `LOT_W` | 80 | One lot. Five lots, no gap, 20 units of margin each side |

`towerHeight(price)` is `PODIUM + (price - 55) * PER_POINT`, clamped to 55 to 145. `viewTop()` crops the sky so ordinary prices are not mostly empty sky; it always keeps the horizon and 34 units above the tallest roof. Give two skylines the same crop with `skylineTop(a, b)` and the `top` prop.

Because the lots are equal, a five-column grid with 4.545% side padding lines up with the towers. `SkylineCard` uses this to print each ticker and price under its tower.

### The five buildings (`buildings.tsx`)

Each sector has its own architecture, so it is recognisable without colour.

| Sector | Building | Roof |
|---|---|---|
| SKIL | A workshop tower with a sawtooth annex | A tower crane with a load on the hook, an antenna, a bird on the jib |
| WLTH | A bank: steps, six columns, a vault door, a pediment; tall narrow windows | A stepped crown and a pennant |
| NETW | Two slim towers with roofs that slant toward each other, joined by skybridges | Masts, a dish, signal arcs |
| BODY | A tower with a climbing wall (holds and a climber) and a gym on the ground floor | A pool that hangs over the edge, a swimmer, a sunshade |
| MIND | A tower with a garden terrace and a round window | An observatory dome with a telescope, a roof tree |

Drawing rules: flat fills, no outlines, no gradients. Light comes from the upper left: every tower has a front (`F`), a lit facet at its upper left (`L`), a shaded side on its right (`S`), dark trim (`D`) and window glass (`W`). Each tower throws a short shadow to the right on the street. Windows sit on a grid counted from the street, one row per floor, and are drawn as two paths per face (glass and lit), so the markup stays small: the hero skyline is about 28 KB.

Three detail levels follow the size: glyph (massing and roof shapes only), small (windows), card and hero (every detail).

### Scenery (`scenery.tsx`)

The sky in four flat bands, the bay, the far shore under the horizon, the street with a dashed path. Small living details for a second look: clouds, three birds, a hot-air balloon by day, a sailboat, water glints, street trees, lamps that glow at night, a cyclist, someone walking a dog. The daytime sun sits above the shortest tower so no tower hides it. In the wide scene, low neighbours in quiet colours fill the sides and stay under the horizon.

### Times of day (`palette.ts`)

One palette object per time: `day`, `night`, `dusk`. `skylineCss()` turns them into `--k-*` custom properties, and `app/layout.tsx` puts that stylesheet in the document once: day by default, night under `prefers-color-scheme: dark`, and the classes `k-day`, `k-night`, `k-dusk` for a fixed time. The share image uses the same objects as plain colours.

- **day**: pale blue sky, a warm haze at the horizon, a sun.
- **night**: deep blue, stars, a crescent moon, lit windows, glowing lamps.
- **dusk**: indigo to violet to rose bands, a large sun going down behind the city. Only the share image.

**Lit windows carry meaning.** `lit={{ BODY: true, MIND: true, SKIL: false, … }}`: a sector updated today has its lights on; one that was not is nearly dark. Leave `lit` out and every tower is lit normally.

### `Skyline` props

| Prop | Meaning |
|---|---|
| `prices` | The five prices. Missing or null: no price |
| `status` | Per sector: `listed`, `unlisted` (a fenced lot with a sign), `insufficient` (a frame under scaffolding), `halted` (the tower dimmed, lights out, a barrier at the door). Lots without a tower claim no height |
| `time` | `auto` (the theme), `day`, `night`, `dusk` |
| `size` | `glyph` (48 to 96px, towers only), `small` (120 to 240px), `card` (the full scene), `hero` (wide, with neighbours; under 700px it is cropped to the five lots so the towers keep their size) |
| `rise` | Towers rise from the street once |
| `lit` | Which sectors have their lights on |
| `build`, `active` | The check: `{ built, total }` per sector, and the sector being answered. Prices are ignored; every tower is built toward the height of 100 and gains an equal share per answer. A sector with no answers is an empty lot. A pin marks the active sector |
| `top`, `sceneWidth`, `detailTop` | Crop and width overrides (compare, share image) |
| `palette` | Plain colours for an image drawn outside the page |
| `label` | Replaces the generated description. Pass `""` when the same numbers are printed next to it |

Related: `SkylineCard` (skyline plus the legend under the towers), `SkylineScene` (the bare `<svg>`, for nesting), `TypeEmblem`, `Spot`, `SectorGlyph`.

### Types (`src/copy/types.ts`)

A type is the pair of a person's two highest sectors, in either order: ten pairs, ten names. `typeForPrices(prices)` picks it; a tie goes to the sector that comes first. The names and lines live in that one file so the founder can rename them.

| Pair | Name |
|---|---|
| SKIL + WLTH | The Builder |
| SKIL + NETW | The Operator |
| SKIL + BODY | The Engine |
| SKIL + MIND | The Steady Hand |
| WLTH + NETW | The Anchor |
| WLTH + BODY | The Long Runner |
| WLTH + MIND | The Planner |
| NETW + BODY | The Teammate |
| NETW + MIND | The Confidant |
| BODY + MIND | The Even Keel |

A name is plain and adult. A line leads with the strength and claims only what two high sectors can mean. `TypeEmblem` draws the two buildings side by side, each on its own tint. `TypeCard` shows emblem, name, line and the two sector tags.

### Spots

`Spot` draws a small scene for an empty state from the same parts: `lot` (nothing here yet), `building` (not enough data), `halted`, `sunrise` (the day is not opened yet). A spot is decoration; the sentence next to it says what is going on.

## 6. Components

Import from `@/ui`. All text comes from `src/copy`.

**Figures**: `Price` (hero, xl, lg, md, sm), `Ticker` (plain or chip), `Change` (the pill), `Tag` (Leader, Laggard, Limit up, Limit down, Halted, Resumed, Sample data), `SectorTag` (glyph, code, optional name, on the sector wash).

**Actions**: `Button` (primary: an ink pill, one per screen; secondary: outlined; quiet: text; sizes lg 56, md 48, sm 44; `href` makes it a link), `IconButton` (round, 44px, needs a `label`).

**Surfaces**: `Card` (raised, flat, sunk, or tinted with a `sector`; `pad` none, sm, md, lg), `Band` (a full-width tinted section whose top edge is a skyline silhouette; tones: a sector, `sunk`, `ink`; bands follow each other without a gap), `Rule`, `Sheet` (a native modal dialog: bottom sheet on a phone, centred panel from 700px; focus is trapped and returns to the opener; Escape and the backdrop close it).

**Notices**: `Note` (info, care for the mind notice, plain), `BaselineNote` (the provisional-baseline statement; it stays on the result until real data replaces the baseline), `Toast` with `useToast`, `Skeleton`, `SkeletonText`, `SkeletonQuote` (still blocks, no shimmer).

**Input**: `Field` (text or number with affixes, hint, error), `OptionList` (the answers to one question: a radio group with one tab stop; arrows, Home and End move; Enter or Space chooses; options are 60px tall, sink when pressed and take the sector colour with a check when chosen), `Useful` ("Was this part useful?", two pills).

**Progress**: the `Skyline` in build mode is the progress indicator of the check. `ProgressCount` says it in words next to it: "Question 33 of 42 · 3 of 5 in Body". `ProgressTape` is for short flows of a few steps (the Daily Open), where a skyline would be too much.

**Quote**: `QuoteHead` (ticker chip, group, hero price, change; "First record, no change yet" on the first), `StatStrip` (issue price, high, low, grade), `Tape` and `TapeCode` (the one-line market comment), `SectorRow` in a `SectorBoard` (building chip, code and name, sparkline from 400px, price, change, position bar, one tag; a row without a price says "Not listed" or "Not enough data"; a halted row is dimmed and tagged), `PositionBar` and `PositionScale` (70 to 130, the tick is 100).

**Onward**: `FeatureEntry` (the one thing to do today, a large tinted card with a spot; one per screen), `Entry` in an `EntryList` (rows with an icon chip, a title, one fact, a status, a chevron), `Streak` (seven windows, filled when the day was recorded, with the count).

**Frames**: `AppShell` (the top bar with the wordmark; one column capped at 560px; with `aside` the illustration comes first on a phone and becomes a sticky left column from 960px; `width="wide"` allows 960px for side-by-side screens; `nav` adds the navigation), `BottomNav` (a floating dock with icons and labels on a phone, links in the top bar from 960px), `Block` (a titled section of an app screen), `PublicShell` and `Column`, `Footer` (Bayu Technology, Atlanta, Georgia, the address, and the two required statements).

**Icons**: `src/ui/icons.tsx`. One family: 24px grid, 1.8 stroke, round caps and joins, the current colour. `Mark` is the five-tower mark. Sector glyphs are the five building silhouettes at 20px. No emoji anywhere.

## 7. Charts

Hand-written SVG in `src/ui/charts/`. The math is pure and tested (`scale.ts`). The 100 line is always drawn: dashed, in the secondary ink, with a "100" label.

- `PriceChart`: dated points, the 100 line, a soft area between the line and 100, an end dot, optional rings for full checks and a marker for a version change, spacing by record or by day. It draws in once, in step with the hero price.
- `Sparkline`: recent records with the 100 line. Give all rows one `sharedDomain` so 100 means the same in each.
- `Pentagon`: the five sectors; centre 70, rim 130, the dashed ring is 100; an optional second shape as a dotted outline for compare, so it never reads as the dashed 100 ring.
- `Ruler`: the full scale, 55 to 145, with one marker.

Inside `sectorStyle()` a chart takes that sector's colour; outside it is ink.

## 8. The share image

`ShareCard` draws it as SVG at any width; `renderShareCard(data)` returns the same card as a 1080 × 1350 PNG. The layout is one pure list of operations (`share/layout.ts`) used by both, so they cannot drift apart. The renderer waits for the fonts, turns the scene into an SVG image, draws it on a canvas, then paints the text.

On the card: the skyline at dusk with every light on, the ticker, the overall price, the type name, the five sector prices under their towers, "100 is the provisional median of my group." and "A personal index. Not a security." Never on the card: any answer, the cohort.

## 9. Motion

Motion has a purpose or it is not there.

| Moment | What moves | Timing |
|---|---|---|
| A skyline is first shown (`rise`) | Towers rise from the street, left to right | 1100ms each, 110ms apart, ease-out, once |
| An answer in the check | The tower of the current sector gains a floor | 520ms, a slight spring |
| The result is shown (`useOpen`) | The price counts from 100 to the price while the chart line draws; then the change pill and the end dot appear | 250ms delay, 1600ms, ease-out, once |
| A sheet opens | It slides up 48px and fades in | 320ms |
| A pill or an option is pressed | It scales to 0.97 | 120ms |
| A toast appears | It rises 12px | 260ms |

Everything else is still. No parallax, no looping animation, no shimmer. Under `prefers-reduced-motion: reduce` nothing animates: the skyline stands, the price is the price.

## 10. Layout

- Phone first. The narrowest width is 360px: no horizontal scroll (measured on the styleguide).
- App screens: one column, 560px at most, centred. A screen with a skyline passes it as `aside`: above the content on a phone, a sticky left column from 960px, with the content in the 560px column on the right.
- Public pages: 1120px at most, built from full-width `Band`s.
- One obvious action per screen: one primary button.

## 11. Reference screens

At `/styleguide#screens`, each at the width of the window. Screenshots in `design/shots/v2/` at 390 and 1440 wide, light and dark.

1. **A question of the check**: the skyline under construction with the pin, `ProgressCount`, the question, `OptionList` in the sector colour, a quiet Skip.
2. **The result reveal**: the skyline rises, then `QuoteHead` counts up; `StatStrip`; price history and the market comment; the sector board; the type card and the pentagon; the baseline note; Share and Compare; `Useful` after each section; the footer with the statements. If the mind notice applies it goes first, as `Note tone="care"`.
3. **The market home**: a small skyline with today's lights, `QuoteHead` with the change since yesterday, the position against the issue price, the Daily Open as the feature with the streak, the sector board, the entries (Payday Check, Weekly Win, People Nudge, retake, settings), the dock.
4. **Compare**: two skylines on one crop, two type cards, a mirrored table sector by sector, two shapes in one pentagon.
5. **The share card**.

## 12. Do

- Draw the 100 line, in every chart and every skyline.
- Use a sector's colour only for that sector.
- Put a gain or a loss in the `Change` pill.
- Give each screen one skyline, one primary action and real spacing between sections.
- Say why a sector has no price ("Not listed", "Not enough data", "Halted") and draw the matching lot.
- Keep text in `src/copy`, in short sentences with concrete numbers.

## 13. Do not

- No grey pages, no pure black or pure white grounds at night.
- No green or red outside the pill, the two limit tags and a field error.
- No grids of identical cards. Use one feature and a list of rows, or a board.
- No stock gradients, no glass blur, no emoji, no icon library, no image files for illustration.
- No motion beyond section 9.
- No invented numbers, user counts, quotes or logos.
- No internal 0 to 1 values. People see prices.
- No third-party resource of any kind: fonts, scripts, images and icons are all served from this site.
- Do not show a taller or shorter tower than the price says, and do not hide the horizon.
