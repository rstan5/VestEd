# VestEd

VestEd is a collegiate investment competition prototype: individual, club, and university standings, a simulated portfolio, and an AI Professor that explains the sample book. No real money. No live market, news, or model integration.

## Run locally

```bash
cd /Users/rstanford5/Desktop/VestEd
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The demo session is Maya Chen. Trades persist in this browser under `vested.demo.ledger.v1`. **Reset demo** in the header restores her original book.

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

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
