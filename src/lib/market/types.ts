// "live" and "delayed" are deliberately absent. Add them only alongside a licensed vendor adapter.
export type MarketStatus = "sample" | "unavailable";

export const SAMPLE_LABEL = "Sample data";

export type Unavailable = { status: "unavailable"; reason: string };
export type Sample<T> = { status: "sample"; label: typeof SAMPLE_LABEL; data: T };
export type MarketResult<T> = Sample<T> | Unavailable;

export type MarketQuote = {
  ticker: string;
  name: string;
  type: InstrumentType;
  sector: string;
  price: string;
  previousClose: string;
  change: string;
};

export type InstrumentType = "stock" | "etf";

export type MarketListing = {
  ticker: string;
  name: string;
  type: InstrumentType;
  sector: string;
};

export type MarketProfile = MarketListing & {
  description: string;
  volume: string;
  marketCap: string;
};

export type HistoryBar = { index: number; close: string };

export type MarketHeadline = {
  id: string;
  title: string;
  summary: string;
  tickers: string[];
};

export interface MarketAdapter {
  /** US stocks and ETFs whose ticker or name matches. An empty query lists the whole universe. */
  search(query: string): Promise<MarketResult<MarketListing[]>>;
  profile(ticker: string): Promise<MarketResult<MarketProfile>>;
  quote(ticker: string): Promise<MarketResult<MarketQuote>>;
  history(ticker: string): Promise<MarketResult<HistoryBar[]>>;
  news(ticker?: string): Promise<MarketResult<MarketHeadline[]>>;
}

export type BenchmarkWindow = { start: string; end: string };

export interface BenchmarkAdapter {
  totalReturn(window: BenchmarkWindow): Promise<Unavailable>;
}
