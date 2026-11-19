# Standing

Standing is a whole-person check. It prices five sectors of a person like stocks: Body (BODY), Mind (MIND), Wealth (WLTH), Capability (SKIL), Network (NETW). The median of the same age band and situation is 100, 15 points is one standard deviation, the range is 55 to 145, and the overall price is the equal-weighted mean. It is a phone-first web app built by Bayu Technology, a student team in Atlanta.

**Everything is in English**: the interface, the documentation, code comments, commit messages. The founder decided this on 2026-11-19. There is no language switch. The question bank still carries Chinese text and the engine still accepts a language, but the app always uses `en`.

## Which document wins

1. The product roadmap deck (`docs/roadmap.txt`). It decides what gets built, the four stages, the stack, and the gates between stages. It is planning only: **do not take any visual design from it.**
2. `PROMPT.md` (in Chinese). It gives the detailed rules for each feature: scoring, skips, daily open, payday, privacy, copy. Follow it wherever the deck is silent or only summarises. Its requirement for a Chinese interface no longer applies.
3. `reference/`. The verified question bank, the reference engine and 335 golden vectors. It is the authority on the scoring algorithm. Read-only.

The visual design is new and is specified in `DESIGN.md`. `README.md` is the team's handbook: running, deploying, the tables, changing a question, changing the algorithm, how each dashboard number is computed, and the open decisions.

## Scope

- Stage 1, Check: questionnaire (every question can be skipped or marked not applicable), scoring engine with a breakdown of every move, result page and share image, friend compare by invite link, anonymous totals per question, versioned questions and scoring, re-score script, the seven scoring tests, team dashboard.
- Stage 2, Daily, web only: market home with a live price per sector, Daily Open (body and mind), Payday Check (wealth), Weekly Win (capability), People Nudge (network). Each has a switch: on locally, off in production until the team turns it on.
- Not built: stage 3 (paid reports, subscription, Stripe, email) and stage 4 (bank connections, verified statement), the native app and HealthKit.

## Stack

- Next.js (App Router), React, TypeScript, deployed on Vercel.
- The scoring engine is a dependency-free TypeScript rules package in `src/engine/`, shared by web, server and a later mobile app.
- Supabase Postgres in production. Local development and tests use PGlite, an embedded Postgres, with no account. Local data lives in `.data/`.
- PostHog receives events from the server only, and only when `POSTHOG_KEY` is set. The browser loads no third-party script. Answer values are never sent to PostHog.
- Vitest for unit tests. Playwright with a phone viewport and the installed Chrome for flows.

## Commands

Node lives in `~/.local/node/bin`. If `node` or `npm` is not found, run `export PATH="$HOME/.local/node/bin:$PATH"` first.

| Command | What it does |
|---|---|
| `npm run dev` | Local development at http://localhost:3000 |
| `npm run preview` | Production build, then serve it at http://localhost:3000 |
| `npm test` | Unit tests |
| `npm run test:e2e` | Flow tests. Builds the app and serves it on port 8799 with its own database (`.data/e2e`, emptied first) |
| `npm run typecheck` | Engine purity check plus the whole project |
| `npm run db:migrate` | Apply `supabase/migrations/` to the database in `DATABASE_URL` |
| `npm run seed:demo` | Generate demo data, clearly marked as simulated. Local only |
| `npm run recompute` | Re-score all history with a chosen algorithm version and print old against new |
| `npm run eval` | The seven scoring tests |

## Layout and layering

```
app/                  Next.js routes: pages, layouts, the API entry (app/api/[[...path]]/route.ts)
src/engine/           Scoring rules package. Pure TypeScript: no DOM, no Node, no clock, no randomness
src/shared/           Types shared by client and server (API requests and responses) and the fetch client
src/server/           API handlers. They depend only on the Db interface in src/server/db.ts
src/ui/               React components, charts, design-system primitives
src/client/           Browser state: device storage, the event queue
src/copy/             All interface text
src/styles/           Design tokens and base styles
supabase/migrations/  Schema and changes, applied in file-name order
scripts/              Migrate, re-score, eval, demo data
tests/unit/           Vitest
tests/e2e/            Playwright. support.ts has the fixture (a console error or a request to another origin fails the test) and the helpers
design/shots/         Screenshots. final/ is every screen at 390 wide, light and dark
docs/                 The roadmap text and research background
reference/            Read-only
```

Rules:

- `src/engine/` must pass `tsconfig.engine.json` (no DOM, no Node).
- Every value without data behind it lives in `src/engine/config.ts` with a comment. No stray numbers in code.
- Server SQL is PostgreSQL with `$1` placeholders. Timestamps are ISO 8601 text, days are `YYYY-MM-DD` text, aggregates are cast (`count(*)::int`, `avg(x)::float8`), so local and hosted return identical rows.
- Environment variables are read only in `src/server/env.ts`.
- Raw records (question events, daily inputs) are append-only. Results are derived and can be recomputed.
- A new table that holds data of a person has a `user_id` column and an entry in `USER_TABLES` (`src/server/tables.ts`). Every new table enables row level security in its migration, as `0006_row_level_security.sql` does for the first fifteen. Unit tests check both.
- Every scored input carries a `source`: `questionnaire`, `daily_open`, `payday`, `weekly_win`, `people_nudge`, `connected`.
- The server receives the minimum needed for scoring and the dashboard. No IP addresses. Payday amounts stay on the device; the server receives bands only.
- Fonts are bundled from `node_modules`. No remote fonts.
- Internal 0 to 1 values are never shown to users. Users see prices.

## Copy rules

All interface text lives in `src/copy/`. It must read as written by a person. The founder rejects copy that reads machine-written.

- No em dashes. No "not X but Y". No exclamation marks. No slogans.
- Short declarative sentences that state facts with concrete numbers.
- One market vocabulary, used consistently: issue price, open, leader, laggard, top gainer, top loser, limit up, limit down, halted, resumed.
- Results lead with strengths, then what can grow. No public rankings.
- A low price is never mocked. When the mind notice is shown, MIND is not tagged laggard and the commentary does not say it trails.
- Up is green with an up arrow, down is red with a down arrow. Never colour alone.

`tests/unit/copy.test.ts` checks these patterns. Run it after adding copy.

## Nothing invented

- No made-up user counts, testimonials, press logos or "more than N users".
- The baseline is provisional (median 0.5, standard deviation 0.2 for every sector). Until real data replaces it, the result page says so.
- Never claim compliance with a named law. The privacy notice and terms are drafts that need a lawyer before public launch.
- The product states: this is not a medical diagnosis, not financial advice, not a credit score; the price is a way of showing a personal index, not a security, and cannot be traded.
- Demo data is generated locally only and is marked as simulated. Production never contains simulated data.

## What the founder does himself

Do not do these for him: create Supabase, PostHog or Vercel projects, set secrets, bind a domain, deploy to production. Prepare the commands and steps and wait. Pushing to his GitHub and posting in Slack happen only when he asks.

## Footer

Bayu Technology, Atlanta, Georgia, teambayutech@gmail.com.
