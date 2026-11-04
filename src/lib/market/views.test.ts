import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketAdapter } from "./adapter";
import { loadDiscovery, loadSecurity, normalizeTicker, parseQuery, parseTypeFilter, securityStats } from "./views";

const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const sampleMarket = createMarketAdapter({});
const disconnected = createMarketAdapter({ MARKET_DATA_PROVIDER: "massive", MARKET_DATA_API_KEY: "placeholder" });

test("discovery filters by type and keeps every row labeled sample", async () => {
  const etfs = await loadDiscovery(sampleMarket, { query: "", type: "etf", watchlist: [] });
  assert.equal(etfs.results.status, "sample");
  const rows = etfs.results.status === "sample" ? etfs.results.rows : [];
  assert.deepEqual(rows.map((row) => row.ticker), ["SPY", "VTI"]);
  assert.ok(rows.every((row) => row.quote.status === "sample" && row.listing?.type === "etf"));
  assert.equal(etfs.news.status, "sample");
  assert.doesNotMatch(JSON.stringify(etfs), /"(status|label)":"[^"]*(live|delayed)/i);
  assert.doesNotMatch(JSON.stringify(etfs), ISO_TIME);
});

test("watchlist symbols outside the search still resolve in the directory", async () => {
  const view = await loadDiscovery(sampleMarket, { query: "apple", type: "all", watchlist: ["SPY", "AAPL"] });
  const rows = view.results.status === "sample" ? view.results.rows : [];
  assert.deepEqual(rows.map((row) => row.ticker), ["AAPL"]);
  assert.deepEqual(Object.keys(view.directory).sort(), ["AAPL", "SPY"]);
  assert.equal(view.directory.SPY.listing?.name, "SPDR S&P 500 ETF");
});

test("without a connected vendor, discovery and detail are unavailable rather than sample", async () => {
  const view = await loadDiscovery(disconnected, { query: "", type: "all", watchlist: ["AAPL"] });
  assert.equal(view.results.status, "unavailable");
  assert.equal(view.news.status, "unavailable");
  assert.equal(view.directory.AAPL.quote.status, "unavailable");
  assert.equal(view.directory.AAPL.listing, null);

  const detail = await loadSecurity(disconnected, "AAPL");
  for (const part of [detail.profile, detail.quote, detail.history, detail.stats, detail.news]) assert.equal(part.status, "unavailable");
});

test("detail statistics come from the sample quote and its own sample bars", async () => {
  const detail = await loadSecurity(sampleMarket, "cat");
  assert.equal(detail.ticker, "CAT");
  assert.equal(detail.stats.status, "sample");
  if (detail.stats.status !== "sample" || detail.history.status !== "sample") return;
  const closes = detail.history.data.map((bar) => Number(bar.close));
  assert.equal(detail.stats.data.price, "392.50");
  assert.equal(detail.stats.data.change, "3.30");
  assert.equal(detail.stats.data.changeRatio, "0.008479");
  assert.equal(Number(detail.stats.data.rangeHigh), Math.max(...closes));
  assert.equal(Number(detail.stats.data.rangeLow), Math.min(...closes));
  assert.equal(detail.stats.data.bars, closes.length);
  assert.equal(detail.stats.data.volume, "2800000");
  assert.ok(detail.news.status === "sample" && detail.news.data.length > 0);
});

test("statistics without history leave the range unavailable instead of inventing one", async () => {
  const quote = await sampleMarket.quote("AAPL");
  const stats = securityStats(quote, { status: "unavailable", reason: "none" }, { status: "unavailable", reason: "none" });
  assert.equal(stats.status === "sample" && stats.data.rangeHigh, null);
  assert.equal(stats.status === "sample" && stats.data.volume, null);
});

test("unknown and malformed symbols are unavailable", async () => {
  const unknown = await loadSecurity(sampleMarket, "ZZZZ");
  assert.equal(unknown.quote.status, "unavailable");
  assert.equal(unknown.stats.status, "unavailable");
  const malformed = await loadSecurity(sampleMarket, "<script>");
  assert.equal(malformed.quote.status, "unavailable");
  assert.equal(normalizeTicker(" brk.b "), "BRK.B");
  assert.equal(normalizeTicker("a b"), null);
  assert.equal(parseTypeFilter("crypto"), "all");
  assert.equal(parseQuery(`  ${"x".repeat(100)}`).length, 60);
});
