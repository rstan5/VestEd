import Decimal from "decimal.js";
import type {
  HistoryBar,
  InstrumentType,
  MarketAdapter,
  MarketHeadline,
  MarketListing,
  MarketProfile,
  MarketQuote,
  MarketResult,
  Unavailable,
} from "./types";
import { SAMPLE_LABEL } from "./types";

export type TypeFilter = "all" | InstrumentType;

export const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
];

const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,24}$/;
const MAX_QUERY = 60;

export function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return TICKER.test(ticker) ? ticker : null;
}

export function parseTypeFilter(value: unknown): TypeFilter {
  return value === "stock" || value === "etf" ? value : "all";
}

export function parseQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_QUERY) : "";
}

/** One listed symbol and its quote. `listing` is null only when neither the search nor the quote could name it. */
export type MarketRow = { ticker: string; listing: MarketListing | null; quote: MarketResult<MarketQuote> };

export type DiscoveryView = {
  query: string;
  type: TypeFilter;
  results: { status: "sample"; label: typeof SAMPLE_LABEL; rows: MarketRow[] } | Unavailable;
  /** Every row the page knows, keyed by ticker, so watchlist entries resolve without another request. */
  directory: Record<string, MarketRow>;
  news: MarketResult<MarketHeadline[]>;
};

function listingFromQuote(quote: MarketResult<MarketQuote>): MarketListing | null {
  if (quote.status !== "sample") return null;
  const { ticker, name, type, sector } = quote.data;
  return { ticker, name, type, sector };
}

export async function loadDiscovery(
  adapter: MarketAdapter,
  input: { query: string; type: TypeFilter; watchlist: string[] },
): Promise<DiscoveryView> {
  const [search, news] = await Promise.all([adapter.search(input.query), adapter.news()]);
  const directory: Record<string, MarketRow> = {};

  let results: DiscoveryView["results"];
  if (search.status === "sample") {
    const listings = search.data.filter((item) => input.type === "all" || item.type === input.type);
    const rows = await Promise.all(
      listings.map(async (listing) => ({ ticker: listing.ticker, listing, quote: await adapter.quote(listing.ticker) })),
    );
    for (const row of rows) directory[row.ticker] = row;
    results = { status: "sample", label: SAMPLE_LABEL, rows };
  } else {
    results = search;
  }

  const missing = input.watchlist.filter((ticker) => !directory[ticker]);
  const watched = await Promise.all(
    missing.map(async (ticker) => {
      const quote = await adapter.quote(ticker);
      return { ticker, listing: listingFromQuote(quote), quote };
    }),
  );
  for (const row of watched) directory[row.ticker] = row;

  return { query: input.query, type: input.type, results, directory, news };
}

export type SecurityStats = {
  price: string;
  previousClose: string;
  change: string;
  /** Change over previous close, as a fraction. */
  changeRatio: string | null;
  rangeHigh: string | null;
  rangeLow: string | null;
  bars: number;
  volume: string | null;
  marketCap: string | null;
};

export type SecurityView = {
  ticker: string;
  profile: MarketResult<MarketProfile>;
  quote: MarketResult<MarketQuote>;
  history: MarketResult<HistoryBar[]>;
  stats: MarketResult<SecurityStats>;
  news: MarketResult<MarketHeadline[]>;
};

export function securityStats(
  quote: MarketResult<MarketQuote>,
  history: MarketResult<HistoryBar[]>,
  profile: MarketResult<MarketProfile>,
): MarketResult<SecurityStats> {
  if (quote.status !== "sample") return quote;
  const previous = new Decimal(quote.data.previousClose);
  const closes = history.status === "sample" ? history.data.map((bar) => new Decimal(bar.close)) : [];
  return {
    status: "sample",
    label: SAMPLE_LABEL,
    data: {
      price: quote.data.price,
      previousClose: quote.data.previousClose,
      change: quote.data.change,
      changeRatio: previous.isZero() ? null : new Decimal(quote.data.change).div(previous).toFixed(6),
      rangeHigh: closes.length > 0 ? Decimal.max(...closes).toFixed(2) : null,
      rangeLow: closes.length > 0 ? Decimal.min(...closes).toFixed(2) : null,
      bars: closes.length,
      volume: profile.status === "sample" ? profile.data.volume : null,
      marketCap: profile.status === "sample" ? profile.data.marketCap : null,
    },
  };
}

const invalidSymbol = (value: string): Unavailable => ({
  status: "unavailable",
  reason: `${value.slice(0, 25) || "That"} is not a valid stock or ETF symbol.`,
});

export async function loadSecurity(adapter: MarketAdapter, rawTicker: string): Promise<SecurityView> {
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) {
    const result = invalidSymbol(rawTicker);
    return { ticker: rawTicker.toUpperCase(), profile: result, quote: result, history: result, stats: result, news: result };
  }
  const [profile, quote, history, news] = await Promise.all([
    adapter.profile(ticker),
    adapter.quote(ticker),
    adapter.history(ticker),
    adapter.news(ticker),
  ]);
  return { ticker, profile, quote, history, stats: securityStats(quote, history, profile), news };
}
