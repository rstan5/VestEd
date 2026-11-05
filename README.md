# VestEd

VestEd is a collegiate investment competition prototype: individual, club, and university standings, a simulated paper portfolio, and a Professor workspace. No real money. No live market, news, or model integration, and no deployed site. See [What is real, what is sample, what is blocked](#what-is-real-what-is-sample-what-is-blocked).

## Run locally

```bash
cd /Users/rstanford5/Desktop/VestEd
npm install
cp .env.example .env.local   # optional; every value stays empty for now
npx next dev --hostname 127.0.0.1 --port 3100
```

`npm run dev` runs the same command with Turbopack. The app binds to `127.0.0.1:3100` only. Never start it with `0.0.0.0` or on port 3000.

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Home, Portfolio, onboarding, account pages, and student profiles need a signed-in student, so start local Supabase first (below). A signed-in student's Home and Portfolio book is their own server ledger, keyed to their profile id; signed-out visitors see the labeled sample demo, whose trades persist in this browser under `vested.demo.ledger.v2` (**Reset sample book** in the account menu restores it).

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

## Local Supabase

The project config lives in `supabase/config.toml` (project id `vested`). It uses the Supabase CLI pinned in `devDependencies` (3.0.0) and Docker. It is a disposable local database. Never link a hosted project.

```bash
npx supabase start --exclude realtime,studio,edge-runtime,logflare,vector,imgproxy,supavisor,postgres-meta
npx supabase status -o env   # local URL and keys; copy what you need into .env.local
npx supabase stop
```

| Port | Service |
| --- | --- |
| 3130 | API gateway (Auth, REST, Storage) |
| 3131 | Postgres |
| 3133 | Mailpit web UI |
| 3134 | Mailpit SMTP |
| 3135 | Mailpit POP3 |
| 3138 | Shadow database, only during `supabase db diff` |

All host ports stay inside 3130–3159. Studio, Realtime, analytics, the connection pooler, imgproxy, and the edge runtime are disabled.

**Exposure warning.** Supabase CLI 3.0.0 cannot bind published ports to localhost. Docker publishes the ports above on all interfaces (`0.0.0.0` and `[::]`), so other devices on the same network can reach this local stack while it runs. This is unavoidable with this CLI version. Keep only disposable data in it and run `npx supabase stop` whenever you are not using it. The Next.js app is not affected: it always binds `127.0.0.1:3100`.

## Accounts

Students register with email and password through Supabase Auth. `src/middleware.ts` refreshes the session cookie on each request and sends signed-out visitors to `/login`. A new student lands on `/onboarding`, can finish without a club or university, and is shown as an unverified individual.

```bash
npx supabase migration up                  # applies supabase/migrations to the running local stack
npx supabase status -o env                 # copy API_URL and PUBLISHABLE_KEY into .env.local as
                                           # NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npx supabase test db                       # pgTAP tests in supabase/tests
```

- `profiles` has one row per student, created by a trigger at signup. Row Level Security lets a student read and update only their own row, and only the name, class year, concentration, privacy, and onboarding columns.
- Holdings are private by default. `public_profile` and `public_holdings` are the only cross-student reads, and they return a safe projection: name, class year, concentration, join month, and, only while published, tickers and weights. Never cash, quantities, cost, orders, or activity.
- Local signup does not require email confirmation. Password recovery mail goes to Mailpit on port 3133.

## Campus

University affiliation and clubs live in `supabase/migrations/20261103130000_campus.sql`. Students have read access only. Every change is a database function that takes the acting student from the session token, so a form cannot act for someone else.

- **University verification** (`/account/verification`). A university email at a recognized domain (or a subdomain of one) creates a **pending** affiliation. It never marks the student verified by itself. Only a reviewer decision sets **verified**. Other students see a university only after it is verified.
- **Clubs** (`/campus`, `/campus/clubs/<id>`). Any student can start a club and becomes its founder. Students apply; the founder or a moderator approves or declines. Only the founder assigns moderators, and nobody can change their own role or take leadership. A student belongs to one club at a time. A club with no members is fine, and so is a student with no club.
- **Admin review.** A new club is **not official** until a reviewer approves it. Any student can file a dispute. A disputed club shows as in admin review and is not official; leadership cannot change and the club cannot be made official until a reviewer resolves the dispute. Members and moderators cannot resolve it.

Reviews use the server-only service role from `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`, from `npx supabase status -o env`). There is no admin console.

```bash
npm run campus:review -- list
npm run campus:review -- club <club-id> official|not_official
npm run campus:review -- dispute <dispute-id> dismissed|upheld
npm run campus:review -- affiliation <affiliation-id> verified|rejected
```

`src/lib/campus/campus.integration.test.ts` runs these rules against local Supabase when it is up and `.env.local` has its keys. When the stack is down, its cases are reported as skipped. `supabase/tests/campus_rls.test.sql` covers the same rules in pgTAP.

The sample club and university directories (`/clubs`, `/universities`) still use sample data. Signed-in standings come from the server. See [What is real, what is sample, what is blocked](#what-is-real-what-is-sample-what-is-blocked).

## Ledger

The server ledger lives in `supabase/migrations/20261103140000_ledger.sql`. Season registration credits exactly $100000.00 once per season and rounds never reset the book. Orders are whole-share, long-only stock and ETF orders, placed through `POST /api/orders` with instrument, side, quantity, and an idempotency key only; a client-supplied price, clock, or account is rejected. Replaying a key returns the original order. Buys reserve the reference quote times shares plus a five percent collar and the $0.01-per-share simulation cost; a fill that would debit more than the reserve is rejected and the reserve released. Eligibility is the later of acceptance plus 15 minutes and the next regular-session open, and DAY orders expire at the New York close of the session they are eligible to work. Students read only their own book.

```bash
npx tsx scripts/run-jobs.ts --store postgres   # one fill pass over the Postgres ledger
JOBS_NOW=2026-11-03T15:00:00Z npx tsx scripts/run-jobs.ts --store postgres   # override the job clock
```

`src/lib/ledger/ledger.integration.test.ts` runs the lifecycle against local Supabase when it is up, and `supabase/tests/ledger_rls.test.sql` covers the permissions in pgTAP.

## Environment

`.env.example` lists every variable with an empty value. Copy it to `.env.local`, which git ignores. Provider keys (`MARKET_DATA_API_KEY`, `AI_API_KEY`) stay empty until licensed credentials exist; with no key, market data and AI replies are unavailable or labeled samples. `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never commit it and never give it a `NEXT_PUBLIC_` prefix.

## Adapters and jobs

Market, benchmark, and model access go through adapters. None of them makes a network call in this build.

| Adapter | Key empty | Key set |
| --- | --- | --- |
| `createMarketAdapter` (`src/lib/market`) | Quotes, history, and news labeled `sample`; unknown tickers are `unavailable` | `unavailable` until a licensed vendor adapter exists |
| `createBenchmarkAdapter` | `unavailable` (no S&P 500 total-return license) | `unavailable` |
| `createModelAdapter` (`src/lib/model`) | `demonstration` replies, labeled as not a model call | `unavailable` until a provider is connected |

No adapter returns `live` or `delayed`, a vendor name, or a freshness timestamp.

Fills, valuations, and round close live in `src/lib/jobs`. Each job is a one-shot async function that takes a store, a session clock, and `now`. `runJobsOnce` runs all three, and `startJobTimer` calls it on an interval for local runs. A hosted scheduled job can call the same function.

```bash
npm run jobs:once                          # one pass over the labeled sample fixture
npx tsx scripts/run-jobs.ts --every 60     # local timer; Ctrl-C stops it
```

The fixture store is in-memory and labeled sample. `--store postgres` runs fills, valuations, round close, and provisional standings against the local Postgres ledger with the service role from `.env.local`. Pass `--season <id>` with a disposable season: without it, every open season is processed, and a round past its end is finalized permanently. The session clock knows regular New York hours and DST; the Postgres store reads holidays and early closes from `market_calendar`.

## Testing

Unit and integration tests use Node's built-in runner. Typecheck and lint are the other gate commands.

```bash
npm test                                   # every src/**/*.test.ts file
npx tsc --noEmit --incremental false
npm run lint
```

Files named `*.integration.test.ts` run against local Supabase when it is up and `.env.local` has its keys. When the stack is down they are reported as skipped, never passed, so check for `skipped 0` before treating a run as database proof.

Database permission tests are pgTAP files in `supabase/tests`. They need the stack running:

```bash
npx supabase test db
```

Browser journeys and accessibility checks use Playwright with `@axe-core/playwright`, in `e2e/`. Start both services first. The Playwright config never starts a server of its own, and it runs one worker so only one browser is open.

```bash
npx supabase start --exclude realtime,studio,edge-runtime,logflare,vector,imgproxy,supavisor,postgres-meta
npx next dev --hostname 127.0.0.1 --port 3100    # in another terminal
npm run test:e2e
npx supabase stop                                # and stop the dev server when done
```

| Spec | What it proves |
| --- | --- |
| `e2e/signup.spec.ts` | A new student registers, finishes setup with no club, lands on Home as an individual, and signs out. |
| `e2e/order.spec.ts` | A buy is accepted and queued, nothing fills before the 15-minute wait, it survives a reload, and cancel releases the reserve. |
| `e2e/rankings.spec.ts` | Provisional standings published through the server publish path show the same ranks as `/api/standings`. Search, sort, and reload do not change a rank, a client rank write gets 405, and the header shows the server's current round. |
| `e2e/a11y.spec.ts` | Home, Portfolio, and Standings have no serious or critical axe violations (WCAG 2.2 AA tags, including color contrast). Every tab stop shows a focus ring, the trade sheet traps focus and returns it on Escape, and nothing animates when reduced motion is requested. |

The journeys create disposable `e2e-*@example.com` students with the local service role and delete them afterwards. The rankings journey also deletes the provisional standings versions it published. It never closes or finalizes a round. The Chromium build Playwright uses must already be installed. `@playwright/test` is pinned to a version that matches the cached browser, so no download is needed.

## What is real, what is sample, what is blocked

Everything runs on this machine against a disposable local Supabase stack. Nothing is deployed, and no hosted environment exists.

### Real (stored in local Postgres, enforced on the server)

- Student accounts, sessions, onboarding, profiles, and privacy settings. Holdings stay private unless the student publishes them.
- University affiliation requests, reviewer decisions, clubs, membership approval, moderators, and disputes.
- The paper ledger: $100,000.00 per season, whole-share long-only orders, the 15-minute fill wait, DAY expiry, cancel, reserves, and idempotent replay.
- Valuation snapshots, provisional standings, round close, insert-only finalized results, and lifetime records, all written by the jobs in `src/lib/jobs` and `src/lib/standings`. Club and university scores are equal-weight.
- The current round shown in the header and on Home, read from the server's `rounds` table.
- The watchlist and saved Professor conversations, stored per student.

### Sample (labeled as sample wherever a student sees it)

- Every quote, price chart, and news item. Stored quotes have `source = 'sample'`, and the market adapter returns `sample` or `unavailable`, never `live`.
- The signed-out Standings board, its two sample round datasets, and the signed-out demo book. These are not finalized history.
- The legacy club and university directories under `/clubs` and `/universities`. Real clubs live under `/campus`.
- Professor replies. They are deterministic templates tagged Demonstration. They are not a model call.

### Blocked (needs something this build does not have)

- **Market license.** No licensed market-data vendor is connected, so there are no live or delayed quotes. The S&P 500 total-return benchmark is unavailable, so benchmark-relative return is not scored. `MARKET_DATA_API_KEY` stays empty.
- **Model credential.** No AI provider key exists. `AI_API_KEY` stays empty, and the Professor stays in demonstration mode.
- **Production email.** Mail goes only to local Mailpit on port 3133. No production email delivery is configured, and a university address is not confirmed by email. A reviewer decides verification instead.
- **Previous-year history.** No finalized results exist for the 2025–26 academic year. The Standings page shows an empty state for it and lists no champions.

Read `PRODUCT_SPEC.md` for scoring rules and `ARCHITECTURE.md` for the production boundary.
