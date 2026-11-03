import Decimal from "decimal.js";
import { headlines, securities } from "../sample-data";
import { SAMPLE_LABEL, type HistoryBar, type MarketAdapter, type MarketHeadline, type MarketQuote, type MarketResult } from "./types";

const HISTORY_LENGTH = 30;

const sample = <T>(data: T): MarketResult<T> => ({ status: "sample", label: SAMPLE_LABEL, data });
const unknown = (ticker: string) => ({
  status: "unavailable" as const,
  reason: `${ticker} is not in the sample universe.`,
});

function find(ticker: string) {
  const symbol = ticker.trim().toUpperCase();
  return { symbol, security: securities.find((item) => item.ticker === symbol) };
}

function sampleQuote(ticker: string): MarketResult<MarketQuote> {
  const { symbol, security } = find(ticker);
  if (!security) return unknown(symbol);
  const price = new Decimal(security.price);
  const previousClose = new Decimal(security.previousClose);
  return sample({
    ticker: security.ticker,
    name: security.name,
    type: security.type,
    sector: security.sector,
    price: price.toFixed(2),
    previousClose: previousClose.toFixed(2),
    change: price.minus(previousClose).toFixed(2),
  });
}

// A deterministic illustrative path that ends at the sample price. It is not a record of real trading.
function sampleHistory(ticker: string): MarketResult<HistoryBar[]> {
  const { symbol, security } = find(ticker);
  if (!security) return unknown(symbol);
  const seed = [...security.ticker].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const end = new Decimal(security.price);
  const bars = Array.from({ length: HISTORY_LENGTH }, (_, index) => {
    const remaining = HISTORY_LENGTH - 1 - index;
    const wobble = remaining === 0 ? 0 : (((seed * (index + 3)) % 23) - 11) / 1000;
    const close = end.times(new Decimal(1).minus(remaining * 0.0015).plus(wobble));
    return { index, close: close.toFixed(2) };
  });
  return sample(bars);
}

function sampleNews(ticker?: string): MarketResult<MarketHeadline[]> {
  let symbol: string | undefined;
  if (ticker !== undefined) {
    const found = find(ticker);
    if (!found.security) return unknown(found.symbol);
    symbol = found.symbol;
  }
  return sample(
    headlines
      .filter((item) => symbol === undefined || item.tickers.includes(symbol))
      .map((item) => ({ id: item.id, title: item.title, summary: item.summary, tickers: [...item.tickers] })),
  );
}

export const sampleMarketAdapter: MarketAdapter = {
  quote: async (ticker) => sampleQuote(ticker),
  history: async (ticker) => sampleHistory(ticker),
  news: async (ticker) => sampleNews(ticker),
};
