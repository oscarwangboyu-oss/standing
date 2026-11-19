# Standing

Standing is a whole-person check. It prices five sectors of a person like stocks: Capability (SKIL), Wealth (WLTH), Network (NETW), Body (BODY) and Mind (MIND). 100 is the median of people in the same age band and situation, 15 points is one standard deviation, prices run from 55 to 145, and the overall price is the equal-weighted mean. Each person's result is drawn as a skyline of five towers.

Built by Bayu Technology, Atlanta, Georgia. Contact: teambayutech@gmail.com.

## Run it locally

Node 22 or later. No account is needed: the app runs on an embedded Postgres stored in `.data/`.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To see the dashboard and charts with data, run `npm run seed:demo` first (simulated data, local only) and open `/team` with the passphrase from `.env.development`.

| Command | What it does |
|---|---|
| `npm run dev` | Local development |
| `npm run preview` | Production build, then serve it |
| `npm test` | Unit tests (engine, server, client, UI) |
| `npm run test:e2e` | Flow tests in a phone viewport, using the installed Chrome |
| `npm run typecheck` | Engine purity check plus the whole project |
| `npm run db:migrate` | Apply `supabase/migrations/` to `DATABASE_URL`, or to the local database |
| `npm run seed:demo` | Generate demo data marked as simulated. Refuses to run in production |
| `npm run recompute -- --algo N` | Re-score all history with another algorithm version and print old against new |
| `npm run eval` | The seven scoring tests |

## What is built

Stage 1, Check:

- The check: 31 to 34 questions depending on the situation, one per screen. Every question can be skipped or marked not applicable. No sign-up.
- The scoring engine in `src/engine/`: a dependency-free TypeScript rules package that passes the 335 golden vectors in `reference/`.
- The result: skyline, quote head, price history, sector table, named type, social position, and a breakdown of every move.
- A share image and friend compare by invite link. There is no public ranking.
- The team dashboard at `/team`: the stage gates, per-question skip rate, drop-off, time, option spread, not-applicable share and retest change, cohort norms, the seven scoring tests, CSV for every table.
- Versioned questions, algorithm and norms. Raw answers are kept and results can be re-scored.

Stage 2, Daily, web only. Each has a switch that is on locally and off in production:

- Daily Open for Body and Mind, Payday Check for Wealth, Weekly Win for Capability, People Nudge for Network.
- A live price per sector that moves at most 2 points a day and halts when data goes stale.

Not built: stage 3 (paid reports, subscription) and stage 4 (bank connections, verified statement), and the native app.

## Stack

- Next.js (App Router), React, TypeScript.
- Supabase Postgres in production through `DATABASE_URL`. PGlite, an embedded Postgres, locally and in tests.
- PostHog receives funnel events from the server only, and only when `POSTHOG_KEY` is set. The browser loads no third-party script, and answer values are never forwarded.
- Vitest and Playwright.

Environment variables are listed in `.env.example` and read only in `src/server/env.ts`.

## Deploying

These steps need the founder's accounts.

1. Create a Supabase project and copy the pooled connection string.
2. Run `DATABASE_URL=... npm run db:migrate`.
3. Create a Vercel project from this repository.
4. Set `DATABASE_URL`, `ADMIN_PASSPHRASE` and `STANDING_ENV=production` in Vercel. Set `POSTHOG_KEY` to forward events.
5. Deploy. Turn on a stage 2 app by setting its flag to `on`, for example `FLAG_DAILY_OPEN=on`.

Two cost notes: the Vercel Hobby plan is for non-commercial use, and the Supabase free tier pauses a project after a week without activity.

## Where things are

```
app/                  Routes: public pages, the app screens, the API entry, /team
src/engine/           Scoring rules package and config.ts (every unvalidated setting, with comments)
src/shared/           API contract (api.ts lists every endpoint) and the typed client
src/server/           API handlers behind a small Db interface
src/client/           Device storage, the event queue, the check session
src/ui/               Design system, skyline illustrations, charts
src/copy/             All interface text. Type names are in types.ts
supabase/migrations/  Schema
scripts/              migrate, recompute, eval, seed-demo
tests/                Unit and flow tests
reference/            The verified question bank, reference engine and golden vectors. Read-only
docs/                 The roadmap text
```

`CLAUDE.md` holds the working rules (copy rules, nothing invented, layering). `DESIGN.md` holds the Skyline design system.

## Changing a question or the algorithm

- A question: add a new bank file next to `src/engine/bank/v2_1.json` with a new version, register it in `src/engine/registry.ts`, and keep the old one so old sessions can still be scored.
- The algorithm or a scoring setting: follow the steps at the top of `src/engine/registry.ts` to add version 2 beside version 1, then run `npm run recompute -- --algo 2` to see the effect on all history before writing it with `--write`.
- The baseline: the norms are provisional (median 0.5, standard deviation 0.2 per sector). Once `/team` shows enough people per cohort, add a new norm version in `src/engine/config.ts`.

## Open decisions for the founder

- Payday Check takes three numbers (income, spending, savings), as in the roadmap. Without a debt figure it can only update the saving-share answer, which only higher-income users are asked. Adding a fourth number would let it move Wealth for everyone.
- The ten type names in `src/copy/types.ts` are first proposals.
- The fast-answer check `f10` cannot reach its two-point level with the current threshold. It was left as in the reference.
- The privacy notice and terms are drafts and need legal review before public launch.
