# VestEd Architecture

## Current milestone

The prototype is a Next.js App Router application with TypeScript and Tailwind CSS. All competition, portfolio, news, and AI behavior runs on a typed sample ledger in the browser and in server-renderable modules. Nothing in this build calls Supabase, a market-data vendor, or a model API.

Sample data is labeled in the interface. Authentication is a fixed demo session for Maya Chen, Ross School of Business, Michigan Investment Association. There is no login wall and no claim of identity verification.

## Module boundaries

```
src/lib/domain.ts        Shared types
src/lib/sample-data.ts   Securities, investors, clubs, universities, news, frozen results
src/lib/scoring.ts       Returns, drawdown, diversification, composite score
src/lib/portfolio.ts     Ledger math and order validation
src/lib/format.ts        Currency, percent, date, and countdown formatting
src/lib/ai.ts            Deterministic professor replies from portfolio context
src/lib/storage.ts       Browser persistence and reset
src/components/          Shell, charts, tables, tickets, chat
src/app/                 Routes
```

Financial calculations live in `src/lib` and are covered by Node's test runner. UI components read computed view models. They do not reimplement ranking formulas.

## Production target

When real integrations are approved, the same boundaries become server modules:

| Module | Responsibility | Prototype | Production |
| --- | --- | --- | --- |
| Identity | Accounts, verification, roles | Fixed demo student | Supabase Auth + verified affiliation records |
| Market data | Quotes, status, corporate actions | Static sample quotes with an as-of timestamp | Provider adapter. No vendor types leak past the adapter |
| Trading | Orders, fills, cash, positions | Client ledger with server-equivalent validation | Postgres ledger, service role only, idempotency keys |
| Competitions | Seasons, rounds, eligibility, frozen boards | Frozen sample standings plus provisional current round | Scheduled jobs, immutable result tables |
| Analytics | TWR, risk, score | Pure functions on sample series | Same functions on stored daily valuations |
| News | Headlines for holdings and names | Curated sample articles | Licensed feed, stored with source and time |
| AI Professor | Explanations over authorized context | Template replies tagged Demonstration | Server route. Context pack is assembled server-side |

## Market data

The provider interface is intentionally small:

```ts
type Quote = {
  ticker: string;
  price: number;
  asOf: string;
  source: "sample" | "delayed" | "live";
  session: "open" | "closed" | "holiday";
};
```

Quote refresh and ranking calculation are different clocks. A 15-minute quote does not move an official board. Official boards rebuild on a schedule from stored valuations, then freeze at round close.

The prototype must not fill an order at a displayed price that is older than the execution quote. The sample execution price is the sample quote plus a one-cent spread, and the fill records both the displayed quote and the fill price.

## Ledger rules

An order is accepted only when:

- the ticker is a known US stock or ETF in the universe,
- quantity is a positive integer,
- a buy's estimated debit is less than or equal to cash,
- a sell's quantity is less than or equal to the open position,
- the account is not already submitting that client order id.

Acceptance and fill are separate states (`accepted`, `filled`, `rejected`). The prototype fills immediately against the sample book so the interaction is visible, and it records the rule it used. Production fills only when the market session is open and a fresh quote is available. If the quote is stale, the order stays accepted and is not priced off the screen.

Positions store quantity and average cost. Sells realize gain against average cost and reduce quantity. Cash cannot go negative. All mutations return a new ledger snapshot. The UI does not edit numbers directly.

Daily portfolio value in the sample series is mark-to-market equity, including cash. Season start equity is $100,000 for every eligible student.

## Time-weighted return

When no external cash flow occurs, return is `ending / starting - 1`.

When a flow occurs, the window is split at the flow. Each subperiod return is chain-linked. A trade between holdings and cash is not an external flow. Season starting capital is the only external flow in the sample season, and it occurs before round 1.

Annualization is used only for volatility and risk-adjusted return, and only after 20 daily observations. It is labeled as an estimate from a short sample, not as a stable risk statistic.

Risk-adjusted return in this prototype is excess daily return over the sample benchmark, divided by sample daily volatility, then annualized with a 252-day convention. It is not called a Sharpe ratio in the official score. Official copy calls it a competition risk-adjusted statistic.

## Ranking job

Production sequence:

1. Value every eligible portfolio at the official timestamp from stored quotes.
2. Compute component metrics with the minimum-data rules in `PRODUCT_SPEC.md`.
3. Rank percentiles inside the eligible population.
4. Write a new standings version with a checksum of inputs.
5. At round close, copy that version into `finalized_results`. Later jobs may add a new version. They may not update a finalized row.

Club score = mean of eligible members' metric. University score = mean of eligible affiliated individuals. Members who failed verification or missed the lock date are excluded and listed as ineligible, not silently dropped.

## Database outline

Production tables, not created in this milestone:

- `profiles`, `university_affiliations`, `clubs`, `club_memberships`, `club_roles`
- `seasons`, `rounds`, `registrations`
- `instruments`, `quotes`, `corporate_actions`
- `orders`, `executions`, `cash_ledger`, `positions`, `valuation_snapshots`
- `standings_versions`, `finalized_results`, `score_components`
- `watchlists`, `published_profiles`
- `news_items`, `ai_sessions`, `ai_messages`
- `audit_events`

Row Level Security: a student reads and writes only their own orders, positions, and private analytics. Public standings and published profile fields are readable by authenticated users. Quote ingestion, fills, and standings writes use a service role that the browser never holds. Club leaders can update membership rows for their club and cannot update another club or a finalized result.

## AI Professor

The context pack may include the requesting student's positions, orders, public competitor aggregates, sample or licensed news already stored, and the methodology text. It must not include another student's private holdings.

Responses must carry the valuation timestamp, name sample versus sourced inputs, and state that the analysis is educational. The assistant cannot submit an order. Demonstration mode never pretends a model wrote the reply.

## Environment

`.env.example` lists future variables and leaves them empty:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC`)
- `MARKET_DATA_PROVIDER`
- `MARKET_DATA_API_KEY`
- `AI_PROVIDER`
- `AI_API_KEY`

No secrets are committed. The prototype runs with none of these set.

## Persistence

Demo trades are stored in `localStorage` under `vested.demo.ledger.v1`. Reset restores the canonical sample book. Standings for other investors stay frozen. Maya Chen's provisional round-4 return updates from her edited book so the dashboard and the board do not disagree. Other rows do not move, because their books were not traded in this session.
