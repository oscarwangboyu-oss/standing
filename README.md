# Standing

Standing is a whole-person check. It asks 31 to 34 questions and prices five sectors of a person like stocks: Capability (SKIL), Wealth (WLTH), Network (NETW), Body (BODY) and Mind (MIND). 100 is the median of people in the same age band and situation, 15 points is one standard deviation, the scale runs from 55 to 145, and the overall price is the equal-weighted mean of the priced sectors.

It is a phone-first web app built by Bayu Technology, a student team in Atlanta. This file is for the team. `CLAUDE.md` holds the working rules (layering, copy, what never to invent), `DESIGN.md` the design system, `PROMPT.md` the detailed product brief (in Chinese) and `docs/roadmap.txt` the roadmap.

What is built:

- **Stage 1, Check.** The questionnaire (every question can be skipped or marked not applicable), the scoring engine with a breakdown of every move, the result page and share image, friend compare by invite link, the team dashboard, versioned questions and scoring, a re-score command and the seven scoring tests.
- **Stage 2, Daily, web only.** The market home with a live price per sector, Daily Open (Body and Mind), Payday Check (Wealth), Weekly Win (Capability) and People Nudge (Network). Each has a switch.

Everything is in English. The question bank still carries Chinese text, and the engine still accepts a language, but the app always uses `en`.

## Run it locally

Node 22 or newer. On the founder's computer Node lives in `~/.local/node/bin`; if `npm` is not found, run `export PATH="$HOME/.local/node/bin:$PATH"` first.

```sh
npm install
npm run seed:demo    # optional: 330 simulated people, so the dashboard and the charts have data
npm run dev          # http://localhost:3000
```

No account is needed. The database is an embedded Postgres (PGlite) in `.data/local`, created and migrated on first use. The team dashboard is at `/team`; the local passphrase is in `.env.development`. Add `?debug=1` to any app address to get the developer panel, which starts a random check and answers one to the end.

Stop `npm run dev` before a script writes to the local database: the embedded Postgres takes one process at a time.

| Command | What it does |
|---|---|
| `npm run dev` | Local development at http://localhost:3000 |
| `npm run preview` | Production build, then serve it at http://localhost:3000. `.env.development` is not read here, so set `ADMIN_PASSPHRASE` in the shell to open `/team` |
| `npm test` | Unit tests (Vitest): engine, server, scripts, client, design tokens, copy rules |
| `npm run test:e2e` | Flow tests (Playwright, phone viewports of 360 and 412 wide, the installed Chrome). Builds the app, serves it on port 8799 with its own database in `.data/e2e`, which is emptied first |
| `npm run typecheck` | Engine purity check, then the whole project. The build itself skips type checking |
| `npm run db:migrate` | Apply `supabase/migrations/` to the database in `DATABASE_URL`, or to the local one |
| `npm run seed:demo` | Generate simulated people, flagged `is_demo`. Refuses to run in production |
| `npm run recompute` | Re-score every stored check with a chosen algorithm version and print old against new |
| `npm run eval` | The seven scoring tests over the stored checks |

## The stack and why

- **Next.js (App Router), React, TypeScript, on Vercel.** One project holds the pages and the API (`app/api/[[...path]]/route.ts`, Node runtime). A push to GitHub deploys. The roadmap names this stack; the first brief named Cloudflare Pages and D1, and the roadmap wins.
- **Supabase Postgres in production.** Plain SQL with `$1` placeholders through one small interface (`src/server/db.ts`). The server connects with the pooled connection string. Standing uses nothing else of Supabase: no auth, no client library, no Data API.
- **PGlite locally and in tests.** An embedded Postgres, so local runs and tests need no account and behave like production: the same SQL, the same migrations.
- **PostHog, from the server only, and only when `POSTHOG_KEY` is set.** The browser loads no third-party script. Ten funnel events are forwarded (`src/server/posthog.ts`), with a salted hash in place of the user id, never an answer, a price or an IP address.
- **A dependency-free scoring engine** in `src/engine/`: pure TypeScript with no DOM, no Node, no clock and no randomness, so the browser, the server and a later mobile app compute the same result. `reference/` holds the verified bank, the reference engine and 335 golden vectors; the engine is tested against all of them.
- **Fonts are bundled** from `node_modules`. No request leaves the site. The flow tests fail on any request to another origin.

## Where things are

```
app/                  Routes: the public pages, the app screens in app/(app), the API entry, /team
src/engine/           Scoring rules package. config.ts holds every setting without data behind it
src/shared/           The API contract (api.ts lists every endpoint) and the typed client
src/server/           API handlers behind a small Db interface. team/ computes the dashboard
src/client/           Device storage, the event queue, the check session, the route guards
src/ui/               Design system, skyline illustration, charts, one folder per screen group
src/copy/             All interface text. The type names are in types.ts
supabase/migrations/  The schema, applied in file-name order
scripts/              migrate, recompute, eval, seed-demo
tests/unit/           Vitest
tests/e2e/            Playwright flows
design/shots/         Screenshots, not in git. final/ has every screen at 390 wide, light and dark
reference/            The verified question bank, reference engine and golden vectors. Read-only
docs/                 The roadmap text
```

## Environment variables

Read only in `src/server/env.ts`. Locally nothing needs to be set.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string. Use the pooled "Transaction" string. Empty: the embedded local database. Production refuses to start without it |
| `ADMIN_PASSPHRASE` | Passphrase of the team dashboard at `/team`. Empty: the dashboard is closed |
| `STANDING_ENV` | `local`, `preview` or `production`. Without it: Vercel's own environment name, otherwise `local` |
| `FLAG_DAILY_OPEN`, `FLAG_PAYDAY`, `FLAG_WEEKLY_WIN`, `FLAG_PEOPLE_NUDGE` | Stage switches, `on` or `off`. Default: on outside production, off in production |
| `POSTHOG_KEY` | PostHog project key. Empty: nothing is forwarded |
| `POSTHOG_HOST` | Default `https://us.i.posthog.com` |
| `POSTHOG_SALT` | Mixed into the hash that stands in for a user id. Default: the project key |
| `STANDING_DB_DIR` | Directory of the embedded local database. Default `.data/local` |

`.env.development` holds the local defaults and no secret. Real secrets go in `.env.local` (never committed) or in the Vercel project settings. `.env.example` lists every variable.

## Deployment

The founder does these himself, in this order. Nothing here has been done for him.

1. **Create the Supabase project.** In the project, open Connect and copy the pooled connection string of the Transaction pooler (port 6543), with the database password filled in. The server opens it with prepared statements off, which that pooler needs.
2. **Create the tables.** From this folder:
   ```sh
   DATABASE_URL="postgresql://postgres.<project>:<password>@<host>:6543/postgres" npm run db:migrate
   ```
   It prints the migrations it applied. Running it again applies only what is new. Migration 0006 turns on row level security for every table, so the Supabase Data API serves none of them; the server connects as the owner of the tables and is not affected.
3. **Create the Vercel project** from the GitHub repository. The framework is detected as Next.js; keep the default build settings.
4. **Set the environment variables** for the Production environment in Vercel: `DATABASE_URL` (the same pooled string), `ADMIN_PASSPHRASE` (long and random), `STANDING_ENV=production`, and optionally `POSTHOG_KEY`.
5. **Deploy.** Open `/api/health`: it answers `{"ok":true,"environment":"production"}`. Open `/team` and enter the passphrase.
6. **Turn on stage 2 when the team decides to**, one switch at a time (see Stage switches), and redeploy.

Notes:

- The Vercel Hobby plan is for non-commercial use. A product that charges, or runs for a company, needs the Pro plan.
- The Supabase free tier pauses a project after about a week without activity. A paused project must be restored by hand in the Supabase dashboard, and until then every API call fails.
- Preview deployments on Vercel run as `preview`, with the stage switches on. Give them their own database, or set no `DATABASE_URL` for Preview and do not use the API there. Never point a preview at the production database.
- A later change of the schema is a new file in `supabase/migrations/` and another `npm run db:migrate` against production before the code that needs it is deployed.
- The privacy notice and the terms are drafts and say so on the page. They need a lawyer before public launch.
- Never run `npm run seed:demo` with the production `DATABASE_URL`. The script refuses when the environment is production and when the URL is not on this machine.

## Data tables

Timestamps are ISO 8601 UTC text, days are `YYYY-MM-DD` text, ids are random text. No table has a column for an IP address or a user agent. Raw records are append-only; results are derived and can be recomputed.

| Table | One line |
|---|---|
| `users` | One row per person: a random id, consent state, language, the profile of the latest check, the hash of the recovery code, the `is_demo` flag |
| `device_tokens` | One row per connected device. Only the SHA-256 hash of the token |
| `consents` | Consent history: each time a consent was given or withdrawn, with the version of the text shown |
| `sessions` | One row per check: background answers, state, ticker, bank version, whether Body and Mind are included, started and completed times |
| `question_events` | Raw. Two rows per question: `shown`, then `select`, `skip` or `na`, with seconds, display direction and click position |
| `results` | Derived. One row per check and version set (algorithm, bank, norm), so an old result and its re-score both stay |
| `report_events` | Raw. How the result page is read: sections seen, dwell, shares, "useful" clicks |
| `visits` | Raw. One row per person per local day, for return rates |
| `compare_invites` | One row per invite link. The code is stored as a hash, works once and expires after 14 days |
| `comparisons` | Two rows per comparison, one per person. No prices: they are read from each person's latest result when asked |
| `version_log` | The day an algorithm, bank or norm version came into use. The chart draws a line on it |
| `daily_entries` | Daily Open: one row per person per day, three option indexes |
| `payday_entries` | Payday Check: bands only. No column can hold an amount |
| `weekly_wins` | Weekly Win: the kind and, for a course, a band of hours. No title |
| `people_nudges` | People Nudge: how many people were picked and what each person reached is to the user. No names |
| `_migrations` | The migration files that were applied |

Export and delete walk `USER_TABLES` in `src/server/tables.ts`. A unit test fails when a table with a `user_id` column is missing from that list, and another when a table is left without row level security.

What stays on the device and never reaches the server: payday amounts and the payday setup, Weekly Win titles, People Nudge names, the recovery code after it was shown, and the invite links a person made.

## Changing a question

A bank version that has produced results is never edited: stored checks must re-score the way they were scored.

1. Copy `src/engine/bank/v2_1.json` to a new file, for example `v2_2.json`, set its `bank_version` to `2.2` and make the change there. A question (`items`) has one or more `versions`, each with a `key`, a `when` rule, the text `q`, the options `opts`, the scores `s` and the options pinned last `pin`.
2. Export it from `src/engine/bank/index.ts` the way `BANK_V2_1` is, and add it to `BANKS` in `src/engine/registry.ts`.
3. Copy the `'2.1'` block of `BANK_BANDS` in `src/engine/config.ts` to `'2.2'`. If you changed the options of a question the micro apps read (B2, B3, W3, W5, C_learn), change the band edges to match the new option texts.
4. Point `CURRENT.bank` at `2.2` in `src/engine/registry.ts`.
5. Run `npm test`. `tests/unit/engine/bank.test.ts` pins bank 2.1 to `reference/bank_v2.1.json`; keep that test on 2.1 and add what the new bank changes. `parseBank` refuses a file with the wrong shape.
6. Deploy. A browser that still holds the old bank cannot start a check (the server answers `bank_version_mismatch`); the start screen then asks the person to reload. Checks already completed keep their bank version, and a check in progress finishes on the bank it started with.
7. Log the day for the chart: `insert into version_log (kind, version, effective_day, logged_at) values ('bank', '2.2', '2026-12-01', '2026-12-01T00:00:00.000Z');`

The team dashboard keys its per-question table by bank version, question and version key, so numbers of the old and the new wording never mix.

A change of text that does not change meaning (a typo) is still a new bank version. That is the price of being able to say exactly what each person was shown.

## Changing the algorithm

Every value without data behind it lives in `src/engine/config.ts`, each with a comment. Values that change a score are grouped per algorithm version in `ALGO_PARAMS`. The full procedure is at the top of `src/engine/registry.ts`; in short:

1. **Try it first, without touching the code.** Register a trial version for one run and compare it with what is stored:
   ```sh
   npm run recompute -- --algo 99 --set sector.ownShare=0.5 --set sector.otherShare=0.5
   npm run eval -- --algo 99 --set sector.ownShare=0.5 --set sector.otherShare=0.5
   ```
   The first prints the rank correlation of old and new overall prices, the share of people moving more than 5 points and the ten largest moves. The second gives the version-effect test a verdict. Nothing is written. Against production, put `DATABASE_URL=...` in front.
2. **Add the version.** Only values change: copy the block `ALGO_PARAMS[1]` to key `2`, change the values there, add `registerAlgo(createAlgoV1(2, ALGO_PARAMS[2]))` in `registry.ts` and set `CURRENT.algo` to 2. The rules themselves change: copy `src/engine/algo/v1` to `algo/v2` and change it there. Never edit version 1.
3. **Tests.** The 335 golden vectors pin version 1; keep them running with `versions: { algo: 1 }` and add cases for what version 2 changes.
4. **Deploy, then re-score history:**
   ```sh
   DATABASE_URL=... npm run recompute -- --algo 2 --write --day 2026-12-01
   ```
   It stores the new results next to the old ones, never over them, and logs the day in `version_log`. From then on the chart marks that day, and "Why it moved" lists the version change as its own line.

New norms go the same way: add an entry to `NORMS` in `config.ts`, point `CURRENT.norm` at it, then `npm run recompute -- --algo 1 --norm <name> --write`. Read the Norms table of the dashboard first: it shows the real median, standard deviation and head count of each cohort. Once the norm is not provisional, the result page drops its "The baseline is provisional" note by itself.

`src/engine/algo/test-variant.ts` is a worked example used by tests only (version 9001: half own questions, half others). It is never registered by the app.

## How every dashboard number is computed

`/team`, behind the passphrase. Read only, totals only: no query selects one person, and every share is printed with its counts. Cohorts under 5 people show their head count and nothing else, and a share over fewer than 30 records is printed count first. When simulated people are in the database, a banner says how many. Every table downloads as CSV. The code is `src/server/team/`; the unit tests check each number against constructed data.

**Stage gates.** The values are `GO_CRITERIA` in `src/engine/config.ts`. Each actual number is read from the table that owns it.

| Gate | Actual number |
|---|---|
| Finish rate, 70% or more | People who completed at least one check, of people who started at least one |
| Highest skip rate of one question, 10% or less | The largest skip rate of any question version on the per-question table, over all roles |
| Retest correlation, 0.75 or more | Pearson correlation of the overall price in two checks of the same person 10 to 21 days apart, one pair per person (their earliest) |
| Back on day 7, 25% or more; day 30, 12% or more | People who used Standing on day N after the local date of their first completed check (a visit, or a micro-app entry), of people whose day N is over (two UTC dates later) |
| Payday Check share, 50% or more | Of people active in the last 30 days to whom Payday Check is offered, those who recorded one in that window. This gate is from the brief, not the roadmap |

**Overview.** Checks started and completed, people started and completed (a person who takes the check twice counts once), the same by role, and the retest correlation.

**Questions**, one row per question version that was shown, for all roles or one:

- *Shown*: checks with any event for the version.
- *Skip*: of those shown, checks that skipped it. Red above 10%.
- *Drop-off*: of those shown, checks that did not answer, skip or mark it, are unfinished and have been idle for more than 30 minutes. Red above 3%.
- *Time*: median seconds to select an option, against the median of the medians of other versions whose stems are of similar length (within a ratio of 1.5, at least 3 of them). Red above twice that.
- *Options*: share of the selections on each option. Red when one option is above 60% or any is below 3%.
- *Not applicable*: of those shown, checks that marked it not applicable or chose an option with no score. Red above 15%.
- *Retest*: of people who chose an option of this version in two checks 10 to 21 days apart, the share who chose another one the second time. Red above 30%.

**Prices.** Per sector and cohort (everyone, by role, by age band, role with age band): each person once, with their latest completed check; head count, median, minimum, maximum, and a histogram in bands of 15 points from 55 to 145.

**Norms.** The same cohorts over the internal 0 to 1 sector values: median, mean, sample standard deviation and n, next to the norm in force. This is the table to read before replacing the provisional norm.

**Returns.** By the date of the first completed check: people, and for day 1, 7 and 30 the share who came back, as in the gates.

**Micro apps.** A person is active on a day when they had completed a check and opened Standing or recorded an entry that day. Per app: active people in the window (7 days; 30 for payday), those the app is offered to (Daily Open: with the Body and Mind consent; Payday: own earnings and an eligible role; the weekly apps: everyone), those with an entry, and the entries. Day by day: the share of active people with the consent who did the Daily Open. Week by week: the share of active people with a Weekly Win and with a People Nudge.

**Scoring tests.** The seven tests of `src/engine/evaluation.ts`, the same as `npm run eval`: range (the overall price spreads and few prices sit on a limit), stability (retest correlation), response (points per changed answer between consecutive checks), validity (objective position against the ladder answer, and no two sectors correlating above 0.85), fairness (largest gap between role medians and between age-band medians), gaming (all-best answers, speeding, grade C), version effect (old against new prices where a second version is stored). Each gives pass, warn or not enough data (fewer than 30 records). The thresholds are `EVALUATION` in `config.ts`.

**Result page.** Per section: result pages on which it was seen (a person and a check count once), the median dwell, shares, and the last "useful" or "not useful" click of each person and check.

## Stage switches

Each micro app has a switch: `FLAG_DAILY_OPEN`, `FLAG_PAYDAY`, `FLAG_WEEKLY_WIN`, `FLAG_PEOPLE_NUDGE`, each `on` or `off`. Unset, a switch is on locally and in previews and off in production. To open one in production, set it to `on` in the Vercel project settings and redeploy.

While a switch is off, its endpoint answers 403 `feature_off`, its screen says it is not open yet, the market home leaves it out and the log marks it "Not open yet". Nothing is recorded. The switch does not touch stored data: turning one off later keeps every entry.

The roadmap opens stage 2 only when stage 1 meets its gates. The Stage gates section of the dashboard shows where each gate stands.

## Deliberately not built

- **Stage 3:** paid reports, subscription, Stripe, email.
- **Stage 4:** bank connections and a verified statement. The `connected` source exists as a name in the engine and nothing writes it.
- **The native app, HealthKit and notifications.** The Daily Open reminder is a calendar file the person saves.
- **Accounts.** There is no sign-up, email or password. A device token links a browser to a record, and a recovery code connects another device.
- **A language switch.** English only.
- **Public rankings**, and any screen that names a winner in a comparison.

## Known limits

- The baseline is provisional: median 0.5 and standard deviation 0.2 for every sector. Until a real norm replaces it, "100 is the median of your group" is a design setting, and the result page, the market home and the share image say so.
- Every threshold in `src/engine/config.ts` is an initial setting without data behind it.
- The ticker is set when a check starts. Settings shows it and links to a retake; there is no endpoint to change it alone.
- The steps of `/start` are not kept across a reload. The check itself resumes at the same question on any device with the token.
- Daily records count once 4 of the last 7 days are recorded, and the screen reaches today and yesterday. A price cannot move from Daily Open before the fourth day.
- The Daily Open streak shows the days before a person's first check as missed, and offers yesterday for backfill on the first day.
- Payday amounts, win titles, people's names and invite links live in the browser. Clearing its data, or moving to another device, loses them. The export file includes what the browser holds.
- A Payday Check moves Wealth only for people whose check asked the two questions it can answer (see Open decisions).
- The embedded local database takes one process: stop the dev server before running a script against it.
- Social images resolve their address from Vercel's own variables. With a custom domain, set `metadataBase` in `app/layout.tsx`.
- Not verified in a browser by anyone: a version marker on the price chart, the "Resumed" tag, the retake prompt on day 90, and the offline paths of the micro apps. The engine and server rules behind them have unit tests.
- The flow tests run in Chrome only, at 360 and 412 wide. Safari on a real iPhone has not been tested.

## Open decisions for the founder

1. **The f10 speed check cannot give 2 points.** A mean time multiplier under 0.7 gives 1 point; the reference also lists 2 points under 0.5, and no answer counts below the floor of 0.5, so that level never fires. The fastest possible session gets 1 point and keeps data grade A. Raising the first threshold (the golden vectors stay green up to 0.55) changes the reference rule and needs a new algorithm version. `config.ts`, `flags.speeding`.
2. **Which Wealth answers Payday Check may replace.** Today: the share saved (W5) only for the wording that asks about saving, which high-tier earners get; the other wordings ask about debt payments, which the three numbers do not hold, so those people's share is stored and moves nothing. Months of savings (W3) only when the whole estimated range has left the answered band. Income, emergency expense, net worth and money worry are never touched. A fourth number, debt payments, would let Payday Check move Wealth for everyone; the roadmap asks for three. `config.ts`, `payday`.
3. **One payday is enough** for the saved share to replace the check answer (`payday.minPeriods: 1`). Raise it if single paydays turn out noisy.
4. **The ten type names and their lines** (The Builder, The Operator, and so on) are a first proposal. `src/copy/types.ts` is the only place they live.
5. **Extra items from the micro apps.** How you feel (load 1 in Mind), weeks with a win (load 0.5 in Capability) and people reached (load 0.5 in Network) have no counterpart in the questionnaire. Their loads and windows are design settings.
6. **Weekly Win and People Nudge rules were designed without data**: 28 days to a halt, 4 of 8 weeks before they count, course hours replacing the learning answer only upward, a certificate with an exam counting as one more licence, a mentor reached in 3 weeks of 91 days reading as "at least monthly".
7. **Band edges where the option texts overlap.** "6 to 7" and "7 to 9" hours both name 7; the value goes to the upper band. Two weeks counts as half a month. `BANK_BANDS`.
8. **The mind notice from daily records** shows at "very bad" on 5 of the last 7 days. This is not a clinical threshold. A clinician should look at it, and at the wording of the notice, before launch.
9. **Dashboard definitions the brief left open**: a drop-off needs 30 idle minutes; "similar stem length" is within a ratio of 1.5; a retest is 10 to 21 days; day N of the return rate is counted two UTC dates later; figures of cohorts under 5 are held back.
10. **Invite links** work once and last 14 days, with at most 10 unused per person.
11. **Row level security is on for every table** (migration 0006), so the Supabase Data API returns nothing. If the team ever wants to read tables through that API, it needs policies.
12. **Consent texts.** The general notice and the Body and Mind consent are plain-language drafts with version ids `general-1` and `health-1` (`src/shared/api.ts`). A lawyer should read them with the privacy notice and the terms. A change of meaning needs a new id.
13. **Vercel plan.** Hobby is for non-commercial use. Decide before the first paying user, at the latest.
14. **When to replace the provisional norm**, and with how many people per cohort. The Norms table shows n for each.
15. **The cohort line under the ticker** uses short role names (`src/copy/market.ts`, `roleNames`). They are our wording, not the bank's.
