import type { LedgerBook } from "@/lib/ledger/types";
import type { ContextPack } from "./types";
import { buildContextPack } from "./context";

export const OWNER = { id: "11111111-1111-4111-8111-111111111111", displayName: "Ada Owner" };
export const OTHER = { id: "22222222-2222-4222-8222-222222222222", displayName: "Ben Other" };

export function bookFor(studentId: string, holdings: Array<{ ticker: string; quantity: string; costBasis: string; price: string; sector: string }>, cash: string): LedgerBook {
  return {
    registrationId: `reg-${studentId}`,
    studentId,
    seasonId: "fall-2026",
    seasonName: "Fall 2026",
    startingCapital: "100000.00",
    cash,
    registeredAt: "2026-11-02T15:00:00.000Z",
    positions: holdings.map((item) => ({ instrumentId: item.ticker, quantity: item.quantity, costBasis: item.costBasis })),
    orders: [],
    cashLines: [],
    quotes: Object.fromEntries(
      holdings.map((item) => [item.ticker, { instrumentId: item.ticker, price: item.price, asOf: "2026-11-10T15:20:00.000Z", source: "sample" as const }]),
    ),
    instruments: holdings.map((item) => ({ id: item.ticker, name: `${item.ticker} Corp`, kind: "stock", sector: item.sector })),
  };
}

export const ownerBook = bookFor(
  OWNER.id,
  [
    { ticker: "MSFT", quantity: "40", costBasis: "16000.40", price: "410.00", sector: "Technology" },
    { ticker: "XOM", quantity: "10", costBasis: "1100.10", price: "112.00", sector: "Energy" },
  ],
  "82480.00",
);

export const otherBook = bookFor(OTHER.id, [{ ticker: "NVDA", quantity: "300", costBasis: "39000.30", price: "130.00", sector: "Semiconductors" }], "60999.70");

export const readyPack: ContextPack = buildContextPack({
  owner: OWNER,
  readAt: new Date("2026-11-10T16:00:00.000Z"),
  book: { status: "ready", book: ownerBook },
  watchlist: { status: "ready", tickers: ["SPY", "MSFT"] },
});

export const emptyPack: ContextPack = buildContextPack({
  owner: OWNER,
  readAt: new Date("2026-11-10T16:00:00.000Z"),
  book: { status: "not-registered" },
  watchlist: { status: "ready", tickers: [] },
});

export const unavailablePack: ContextPack = buildContextPack({
  owner: OWNER,
  readAt: new Date("2026-11-10T16:00:00.000Z"),
  book: { status: "unavailable", message: "The ledger did not respond." },
  watchlist: { status: "error", message: "The watchlist did not respond." },
});
