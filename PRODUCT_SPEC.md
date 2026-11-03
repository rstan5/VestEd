# VestEd Product Specification

VestEd is the NCAA for student investors: a collegiate investment competition with the analytical depth of a research terminal and the academic credibility of a university investment program. Students compete individually or as members of verified investment clubs. No real money changes hands.

This document defines the product. The first build is a local prototype with internally consistent sample data. It is not a live competition, live market feed, or production authentication system.

## Users

- **Individual investor.** Any student can register, receive equal virtual capital, and compete without a club.
- **Club member.** A student may apply to one official club. Membership must be approved before the student counts toward club standings.
- **Club leader and moderator.** Leaders create clubs, approve or reject applications, assign moderators, and manage rosters. Moderators can review applications but cannot transfer leadership.
- **University affiliation.** Optional until the student wants verified institutional rankings. Affiliation must be verified independently of club membership.
- **Spectator.** Can browse public standings, club pages, and profiles that opted into public holdings.

## Identity and eligibility

A student has one lifetime investor identity. University affiliation and club membership are separate facts.

Verified institutional rankings require:

- a verified university affiliation,
- an active season registration before the entry deadline,
- for club standings, an approved membership before that season's club lock date,
- no unresolved integrity hold.

Students may still compete individually while verification is pending. Their results appear in open individual standings and are excluded from official university and club rankings until verification clears. Late entry after a round has started does not rewrite earlier round results. The student begins the next full round with the standard capital base, and prior rounds are marked "did not participate."

Safeguards, designed for production and represented in the prototype as rules rather than live enforcement:

- one competition identity per verified student,
- club lock dates so rosters cannot be rearranged after results are known,
- club scores normalized by eligible member count, not raw asset totals,
- minimum participation before official risk metrics are published,
- audit log of roster, order, and ranking changes,
- frozen finalized rounds that cannot be recalculated in place.

## Season structure

A **season** maps to an academic semester. Fall 2026 is the sample season.

A season contains consecutive **three-week rounds**. The sample season has five rounds:

| Round | Window | Status in prototype |
| --- | --- | --- |
| 1 | Aug 24 – Sep 11, 2026 | Finalized |
| 2 | Sep 14 – Oct 2, 2026 | Finalized |
| 3 | Oct 5 – Oct 23, 2026 | Finalized |
| 4 | Oct 26 – Nov 13, 2026 | In progress (as of Nov 2, 2026) |
| 5 | Nov 16 – Dec 4, 2026 | Scheduled |

Any days after the last full round and before the season end date form a partial period. Partial periods are reported but do not create a new official round unless an administrator explicitly configures one. Weekends inside a round remain part of that round; orders execute only during the simulated regular session.

Each student starts each season with **$100,000** virtual cash. Capital does not reset between rounds. Round return is the change in portfolio value from the prior round's official close to the current valuation, using time-weighted return when cash flows occur inside the window.

## What is ranked

Standings exist on three levels:

- **Individual.** The student's own time-weighted return and VestEd Performance Score.
- **Club.** The equal-weighted average of eligible members. A 40-member club does not outrank a 12-member club merely because it has more capital.
- **University.** The equal-weighted average of that university's eligible individuals, not the sum of club assets. Club-only aggregation would erase independent investors and double-count students who also belong to a club.

Each level supports:

- current round,
- cumulative season,
- archived prior rounds and the prior academic year.

Finalized results are immutable. The prototype stores them as frozen sample records. Live round values are marked provisional.

## Ranking metrics

| Metric | Meaning | Minimum data |
| --- | --- | --- |
| Total return | Time-weighted portfolio return for the selected window | One official valuation after entry |
| Risk-adjusted return | Annualized excess return over sample volatility | 20 daily observations |
| Maximum drawdown | Largest peak-to-trough decline in the window | 10 daily observations |
| Diversification | Effective number of holdings, sector coverage, and a 2% position floor | Current holdings |
| Volatility | Annualized standard deviation of daily returns | 20 daily observations |
| Consistency | Share of completed rounds with positive excess return vs. benchmark, scaled by round count | 2 completed rounds |
| Relative performance | Portfolio return minus S&P 500 sample return over the same window | Matching benchmark observations |
| VestEd Performance Score | Weighted composite, 0–100 | Component-specific, below |

Metrics below their minimum are shown as **Insufficient data**, not as zero and not as a favorable default. Educational analytics may still display a provisional figure with an explicit label. Official scores never use that provisional figure.

### Diversification floor

A holding below 2% of portfolio equity does not increase the diversification score. This blocks a book of token positions from looking diversified. Cash above 20% of equity reduces the score, because undeployed capital is not diversification.

### VestEd Performance Score

Official weights, applied only to components that meet their minimum:

- Return percentile: 30%
- Risk-adjusted percentile: 20%
- Drawdown percentile (lower drawdown scores higher): 15%
- Diversification: 15%
- Consistency: 10%
- Relative performance percentile: 10%

If a component is unavailable, its weight is removed and the remaining weights are renormalized. The published score always lists which components were included. A score with fewer than three official components is labeled **Partial** and is ineligible for awards.

Percentiles are computed inside the eligible field for that board (individual, club, or university), never across mixed populations.

The score is a competition ranking device. It is not a forecast, a Sharpe ratio claim for a three-week window, or investment advice.

## Trading rules in the prototype

- US-listed stocks and ETFs only.
- No options, margin, leverage, short selling, or crypto.
- Orders are market orders for whole shares.
- Buys cannot exceed available cash. Sells cannot exceed the position.
- The client never sets the fill price. The server-side sample ledger fills at the next eligible sample quote, not at a stale displayed price.
- Sample fills use a one-cent spread cost so the displayed last price is not treated as a free execution.
- Cash, positions, and order status update together. A failed validation leaves the book unchanged.
- Official rankings are not recomputed on every quote. The prototype separates "sample quote as of" from "standings as of."

Production must add trading-hour checks, holiday calendars, corporate actions, idempotency keys, and row locks. Those are specified in `ARCHITECTURE.md` and are not claimed as live here.

## Surfaces

1. **Dashboard.** Personal command center: equity, cash, period returns, chart, rank and movement, club and university context, round clock, nearest competitors, exposure, watchlist, sample headlines, AI Professor preview, recent activity.
2. **Portfolio.** Holdings, cash, realized and unrealized results, allocation, risk notes, orders, and a validated simulated ticket.
3. **Markets.** Search, trending and widely held lists, and a security page with chart ranges, sample facts, holder count, related sample news, and the same ticket.
4. **Competition.** Individual, club, and university boards. Sort, filter, search, and period selection. Compare two entries. Methodology and freshness are visible.
5. **Profiles.** Investor career page and club page, including privacy-aware holdings.
6. **Research.** Sample news tagged by holding, watchlist, or market. Never presented as a live wire.
7. **AI Professor.** Full chat interface. Without a configured model, responses are deterministic educational demonstrations grounded in the current sample portfolio. They do not execute trades.

## Privacy

Holdings are private by default. A student may publish current holdings. Competitor analysis in the AI Professor and on public profiles uses only published holdings and public aggregate statistics. Private books are never inferred.

## Acceptance for this milestone

- A reviewer can move through every primary nav item and land on a designed page, not a placeholder route.
- Sample portfolio math is internally consistent: holdings, cash, equity, and returns reconcile.
- Placing a demo buy or sell updates the book, cash, and order history, and survives a refresh in this browser.
- Leaderboards sort and filter without inventing a second dataset.
- Insufficient-data and sample-data states are visible where the rules require them.
- Resetting demo data returns the signed-in sample investor to the original book.
- Lint, typecheck, unit tests, and production build pass.
