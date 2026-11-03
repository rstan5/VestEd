import { hasCredential, type ProviderEnv } from "../credentials";
import { sampleMarketAdapter } from "./sample";
import type { BenchmarkAdapter, MarketAdapter, Unavailable } from "./types";

const NOT_CONNECTED: Unavailable = {
  status: "unavailable",
  reason: "A market data key is set, but no licensed vendor adapter is connected in this build.",
};

const BENCHMARK_UNAVAILABLE: Unavailable = {
  status: "unavailable",
  reason: "The S&P 500 total-return series needs a license. No benchmark figure is published.",
};

const notConnectedAdapter: MarketAdapter = {
  quote: async () => ({ ...NOT_CONNECTED }),
  history: async () => ({ ...NOT_CONNECTED }),
  news: async () => ({ ...NOT_CONNECTED }),
};

export function createMarketAdapter(env: ProviderEnv = process.env): MarketAdapter {
  return hasCredential(env.MARKET_DATA_API_KEY) ? notConnectedAdapter : sampleMarketAdapter;
}

/** No credential unlocks the benchmark until a total-return license and its adapter exist. */
export function createBenchmarkAdapter(): BenchmarkAdapter {
  return { totalReturn: async () => ({ ...BENCHMARK_UNAVAILABLE }) };
}

export * from "./types";
