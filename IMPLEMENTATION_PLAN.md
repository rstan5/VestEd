# Implementation Plan

## Decisions made without blocking

- Demo session is Maya Chen, an eligible member of the Michigan Investment Association. A login screen would imply authentication that does not exist.
- Fall 2026 is the live sample season. The clock for countdowns is the viewer's current time, and the season narrative is anchored to November 2, 2026, so round 4 is in progress even if the file is opened later. The UI says so.
- Official boards for other investors are frozen sample results. Maya's provisional figures recompute from her browser ledger so trades stay consistent with her dashboard.
- No paid APIs, no Supabase project, no deployment.

## Phase A — Foundation

1. Scaffold Next.js, TypeScript, Tailwind, and Git.
2. Write the product, architecture, design, and plan documents.
3. Add the domain model, sample universe, and scoring tests before the UI depends on them.

## Phase B — Prototype

1. App shell with sidebar, season bar, and sample-data disclosure.
2. Dashboard command center.
3. Portfolio book, order ticket, and security pages.
4. Markets directory.
5. Individual, club, and university boards with sort, filter, search, period, and compare.
6. Investor and club profiles.
7. Research feed.
8. AI Professor demonstration chat.
9. Universities index and a short methodology page.
10. Browser persistence and a visible reset.

## Phase C — Verification

1. Unit tests for scoring, diversification floor, and order rejection.
2. Lint, typecheck, and production build.
3. README with run instructions and an honest status table.
4. Initial commit.

## Next production milestone

After this prototype is accepted:

1. Supabase schema and RLS for profiles, clubs, memberships, and the ledger.
2. Market-data adapter with a recorded fixture mode and a delayed-quote mode.
3. Server-authoritative order route with idempotency and session checks.
4. Nightly valuation job and an immutable round-close snapshot.
5. Only then, an AI route that receives a server-built context pack.

Do not start that milestone by wiring a vendor key into the client.
