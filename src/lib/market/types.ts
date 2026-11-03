// "live" and "delayed" are deliberately absent. Add them only alongside a licensed vendor adapter.
export type MarketStatus = "sample" | "unavailable";

export const SAMPLE_LABEL = "Sample data";

export type Unavailable = { status: "unavailable"; reason: string };
export type Sample<T> = { status: "sample"; label: typeof SAMPLE_LABEL; data: T };
export type MarketResult<T> = Sample<T> | Unavailable;

export type MarketQuote = {
  ticker: string;
  name: string;
  type: "stock" | "etf";
  sector: string;
  price: string;
  previousClose: string;
  change: string;
};

export type HistoryBar = { index: number; close: string };

export type MarketHeadline = {
  id: string;
  title: string;
  summary: string;
  tickers: string[];
};

export interface MarketAdapter {
  quote(ticker: string): Promise<MarketResult<MarketQuote>>;
  history(ticker: string): Promise<MarketResult<HistoryBar[]>>;
  news(ticker?: string): Promise<MarketResult<MarketHeadline[]>>;
}

export type BenchmarkWindow = { start: string; end: string };

export interface BenchmarkAdapter {
  totalReturn(window: BenchmarkWindow): Promise<Unavailable>;
}
