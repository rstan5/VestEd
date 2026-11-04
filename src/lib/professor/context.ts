import { POSITION_FLOOR, CASH_DRAG_THRESHOLD } from "@/lib/domain";
import { valueLedgerBook } from "@/lib/ledger/book";
import { loadLedgerBook, type LedgerClient } from "@/lib/ledger/load";
import type { LedgerState } from "@/lib/ledger/types";
import { loadWatchlist } from "@/lib/watchlist/load";
import type { WatchlistState } from "@/lib/watchlist/types";
import type { ContextPack, PortfolioContext, PublicContext, WatchlistContext } from "./types";

export type ContextOwner = { id: string; displayName: string };

export type BookInput = LedgerState | { status: "not-registered" };

export const publicContext: PublicContext = {
  benchmark: "unavailable",
  rules: [
    "Each season starts with $100,000.00 of virtual cash. Whole shares of US stocks and ETFs only, long only.",
    "An order fills at the first stored quote at or after 15 minutes from acceptance and the next regular-session open.",
    "Simulation cost is $0.01 per share on every fill.",
    `Holdings under ${Math.round(POSITION_FLOOR * 100)}% of equity do not add to diversification, and cash above ${Math.round(CASH_DRAG_THRESHOLD * 100)}% lowers it.`,
    "The S&P 500 total-return comparison is unavailable until a licensed series exists.",
  ],
};

function portfolioFrom(owner: ContextOwner, book: BookInput): PortfolioContext {
  if (book.status === "not-registered") {
    return { status: "not-registered", message: "No season book is open yet. Opening Portfolio starts one." };
  }
  if (book.status === "signed-out") return { status: "unavailable", message: "Sign in to use your book as context." };
  if (book.status === "unavailable") return { status: "unavailable", message: book.message };
  // Defense in depth: a book is used only when it is the requester's own, keyed to their profile.
  if (book.book.studentId !== owner.id) {
    return { status: "unavailable", message: "The book on this request is not yours, so it was left out." };
  }
  const valuation = valueLedgerBook(book.book);
  const equity = valuation.equity;
  return {
    status: "ready",
    seasonName: book.book.seasonName,
    startingCapital: book.book.startingCapital,
    cash: valuation.cash,
    equity,
    cashWeight: equity && Number(equity) > 0 ? (Number(valuation.cash) / Number(equity)).toFixed(6) : null,
    seasonReturn: valuation.seasonReturn,
    holdings: valuation.positions.map((position) => ({
      ticker: position.instrumentId,
      name: position.name,
      sector: position.sector,
      quantity: position.quantity,
      weight: position.weight,
    })),
    openOrders: book.book.orders.filter((order) => order.status === "accepted").length,
    quotesAsOf: valuation.quotesAsOf,
    quoteSources: valuation.quoteSources,
    missingQuotes: valuation.missingQuotes,
  };
}

function watchlistFrom(state: WatchlistState): WatchlistContext {
  if (state.status === "ready") return { status: "ready", tickers: state.tickers };
  if (state.status === "signed-out") return { status: "unavailable", message: "Sign in to use your watchlist as context." };
  return { status: "unavailable", message: state.message };
}

/** Assembles the context pack from reads already scoped to the requester. */
export function buildContextPack(input: { owner: ContextOwner; readAt: Date; book: BookInput; watchlist: WatchlistState }): ContextPack {
  return {
    studentId: input.owner.id,
    displayName: input.owner.displayName,
    readAt: input.readAt.toISOString(),
    portfolio: portfolioFrom(input.owner, input.book),
    watchlist: watchlistFrom(input.watchlist),
    public: publicContext,
  };
}

/** The open season, or the next one. Mirrors loadLedgerBook. */
async function currentSeasonId(client: LedgerClient, now: Date): Promise<string | null | undefined> {
  const { data, error } = await client
    .from("seasons")
    .select("id, starts_at")
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: true });
  if (error) return undefined;
  const open = (data ?? []).find((season) => new Date(season.starts_at) <= now);
  return (open ?? data?.[0])?.id ?? null;
}

/**
 * Reads the requester's book and watchlist with their own token, so Row Level Security keeps
 * every other student's rows out. Unlike Portfolio, it never opens a season book.
 */
async function readBook(client: LedgerClient, now: Date): Promise<BookInput> {
  const seasonId = await currentSeasonId(client, now);
  if (seasonId === undefined) return { status: "unavailable", message: "The ledger did not respond." };
  if (seasonId === null) return { status: "unavailable", message: "No season is open." };
  const registration = await client.from("registrations").select("id").eq("season_id", seasonId).maybeSingle();
  if (registration.error) return { status: "unavailable", message: "Your season book could not be loaded." };
  if (!registration.data) return { status: "not-registered" };
  return loadLedgerBook(client, now);
}

export async function loadContextPack(client: LedgerClient, owner: ContextOwner, now = new Date()): Promise<ContextPack> {
  const [book, watchlist] = await Promise.all([
    readBook(client, now).catch((): BookInput => ({ status: "unavailable", message: "The ledger did not respond." })),
    loadWatchlist(client).catch((): WatchlistState => ({ status: "error", message: "The watchlist did not respond." })),
  ]);
  return buildContextPack({ owner, readAt: now, book, watchlist });
}
