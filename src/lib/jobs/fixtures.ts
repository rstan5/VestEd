import type { FixtureSeed } from "./fixture-store";

/** A labeled sample book with one buy order that becomes eligible at 10:15 New York time on Monday 2026-11-02. */
export const SAMPLE_JOB_NOW = "2026-11-02T15:20:00.000Z";

export function sampleJobSeed(): FixtureSeed {
  return {
    label: "sample",
    accounts: [{ accountId: "acct-1", cash: "100000.00", reservedCash: "4000.00", positions: [] }],
    orders: [
      {
        id: "ord-1",
        accountId: "acct-1",
        instrumentId: "CAT",
        side: "buy",
        quantity: 10,
        acceptedAt: "2026-11-02T15:00:00.000Z",
        reservedCash: "4000.00",
        status: "accepted",
      },
    ],
    quotes: [
      { id: "q-early", instrumentId: "CAT", price: "390.00", asOf: "2026-11-02T15:10:00.000Z" },
      { id: "q-fill", instrumentId: "CAT", price: "392.50", asOf: "2026-11-02T15:16:00.000Z" },
      { id: "q-later", instrumentId: "CAT", price: "399.00", asOf: "2026-11-02T15:18:00.000Z" },
    ],
    rounds: [{ id: "round-1", endsAt: "2026-11-20T21:00:00.000Z", status: "open" }],
  };
}
