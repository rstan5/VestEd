# VestEd

VestEd is a collegiate investment competition prototype: individual, club, and university standings, a simulated portfolio, and an AI Professor that explains the sample book. No real money. No live market, news, or model integration.

## Run locally

```bash
cd /Users/rstanford5/Desktop/VestEd
npm install
cp .env.example .env.local   # optional; every value stays empty for now
npx next dev --hostname 127.0.0.1 --port 3100
```

`npm run dev` runs the same command with Turbopack. The app binds to `127.0.0.1:3100` only. Never start it with `0.0.0.0` or on port 3000.

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). The demo session is Maya Chen. Trades persist in this browser under `vested.demo.ledger.v1`. **Reset demo** in the header restores her original book.

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

## Environment

`.env.example` lists every variable with an empty value. Copy it to `.env.local`, which git ignores. Provider keys (`MARKET_DATA_API_KEY`, `AI_API_KEY`) stay empty until licensed credentials exist; with no key, market data and AI replies are unavailable or labeled samples. `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never commit it and never give it a `NEXT_PUBLIC_` prefix.
## What works

- Dashboard, portfolio, markets, security pages, competition boards, investor and club profiles, universities, research, and the professor chat.
- Buy and sell validation against cash, position size, and duplicate order ids. Fills use the sample quote plus or minus one cent.
- Sorting, search, university filter, period switch, and side-by-side compare on the boards.
- Scoring helpers for return, drawdown minimums, diversification floor, and risk-adjusted minimums.

## What is mocked

- Quotes, charts on security pages, news, and standings for everyone except Maya's provisional book.
- Authentication, verification, and club applications. Applications do not change rosters.
- AI Professor replies. They are deterministic templates tagged Demonstration.
- Prior-year pages show archived champions only.

## Not implemented

- Supabase auth, Postgres, and row-level security.
- A market-data vendor, corporate actions, and a real trading calendar.
- Server-authoritative orders and immutable round-close jobs.
- A model API. Leave `AI_API_KEY` empty. See `.env.example`.

Read `PRODUCT_SPEC.md` for scoring rules and `ARCHITECTURE.md` for the production boundary. The next milestone is the database and a server ledger, not a vendor key in the browser.
