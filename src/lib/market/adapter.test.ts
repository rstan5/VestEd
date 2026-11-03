import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createBenchmarkAdapter, createMarketAdapter } from "./adapter";

const FORBIDDEN_KEYS = /^(vendor|provider|source|publisher|asOf|as_of|updatedAt|fetchedAt|publishedAt|freshness|timestamp|delay)$/i;
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

let fetchCalls = 0;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("adapters must not call a vendor");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function assertHonest(result: unknown) {
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /"(status|label)":"[^"]*(live|delayed)/i);
  assert.doesNotMatch(json, ISO_TIME, "no freshness timestamp");
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        assert.doesNotMatch(key, FORBIDDEN_KEYS, `result must not carry ${key}`);
        walk(child);
      }
    }
  };
  walk(result);
  const status = (result as { status: string }).status;
  assert.ok(status === "sample" || status === "unavailable", `status ${status}`);
}

const emptyEnvs = [{}, { MARKET_DATA_API_KEY: "" }, { MARKET_DATA_API_KEY: "   ", MARKET_DATA_PROVIDER: "massive" }];

test("empty market key returns labeled sample quote, history, and news", async () => {
  for (const env of emptyEnvs) {
    const market = createMarketAdapter(env);
    const quote = await market.quote("aapl");
    assert.equal(quote.status, "sample");
    assert.equal(quote.status === "sample" && quote.label, "Sample data");
    assert.equal(quote.status === "sample" && quote.data.ticker, "AAPL");
    assert.match(quote.status === "sample" ? quote.data.price : "", /^\d+\.\d{2}$/);
    assertHonest(quote);

    const history = await market.history("AAPL");
    assert.equal(history.status, "sample");
    assert.ok(history.status === "sample" && history.data.length > 1);
    assert.equal(history.status === "sample" && history.data.at(-1)?.close, quote.status === "sample" ? quote.data.price : "");
    assertHonest(history);

    const news = await market.news("CAT");
    assert.equal(news.status, "sample");
    assert.ok(news.status === "sample" && news.data.length > 0 && news.data.every((item) => item.tickers.includes("CAT")));
    assertHonest(news);

    assertHonest(await market.news());
  }
  assert.equal(fetchCalls, 0);
});

test("unknown tickers are unavailable, not invented", async () => {
  const market = createMarketAdapter({});
  for (const result of [await market.quote("ZZZZ"), await market.history("ZZZZ")]) {
    assert.equal(result.status, "unavailable");
    assertHonest(result);
  }
});

test("a market key without a connected vendor is unavailable and calls nothing", async () => {
  const market = createMarketAdapter({ MARKET_DATA_PROVIDER: "massive", MARKET_DATA_API_KEY: "placeholder" });
  for (const result of [await market.quote("AAPL"), await market.history("AAPL"), await market.news("AAPL")]) {
    assert.equal(result.status, "unavailable");
    assert.ok(result.status === "unavailable" && result.reason.length > 0);
    assertHonest(result);
  }
  assert.equal(fetchCalls, 0);
});

test("the S&P 500 total-return benchmark is unavailable without a license", async () => {
  const result = await createBenchmarkAdapter().totalReturn({ start: "2026-11-02", end: "2026-11-20" });
  assert.equal(result.status, "unavailable");
  assert.equal("data" in result, false);
  assertHonest(result);
  assert.equal(fetchCalls, 0);
});
