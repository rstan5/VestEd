import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createModelAdapter } from "@/lib/model/adapter";
import { buildContextPack } from "./context";
import { parseAsk } from "./request";
import { contextRecord } from "./service";
import { OTHER, OWNER, otherBook, ownerBook, readyPack } from "./test-fixtures";

let providerRequests: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  providerRequests = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    providerRequests.push(String(input instanceof Request ? input.url : input));
    throw new Error("the Professor must not call a model provider");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the context pack carries the requester's own book and server watchlist, keyed to their profile", () => {
  const pack = readyPack;
  assert.equal(pack.studentId, OWNER.id);
  assert.equal(pack.displayName, "Ada Owner");
  assert.equal(pack.portfolio.status, "ready");
  if (pack.portfolio.status !== "ready") return;
  assert.deepEqual(pack.portfolio.holdings.map((holding) => [holding.ticker, holding.quantity, holding.weight]), [
    ["MSFT", "40", "0.164000"],
    ["XOM", "10", "0.011200"],
  ]);
  assert.equal(pack.portfolio.equity, "100000.00");
  assert.equal(pack.portfolio.cash, "82480.00");
  assert.equal(pack.portfolio.quotesAsOf, "2026-11-10T15:20:00.000Z");
  assert.deepEqual(pack.portfolio.quoteSources, ["sample"]);
  assert.deepEqual(pack.watchlist, { status: "ready", tickers: ["SPY", "MSFT"] });
  assert.equal(pack.public.benchmark, "unavailable");
  const serialized = JSON.stringify(pack).toLowerCase();
  assert.ok(!serialized.includes("maya"), "the sample investor is not the context");
});

test("another student's private book is excluded from the requester's context pack", () => {
  const pack = buildContextPack({
    owner: OWNER,
    readAt: new Date("2026-11-10T16:00:00.000Z"),
    book: { status: "ready", book: otherBook },
    watchlist: { status: "ready", tickers: [] },
  });
  assert.equal(pack.studentId, OWNER.id);
  assert.equal(pack.portfolio.status, "unavailable");
  const serialized = JSON.stringify(pack);
  for (const privateFact of [OTHER.id, OTHER.displayName, "NVDA", "300", "39000.30", "60999.70", "Semiconductors"]) {
    assert.ok(!serialized.includes(privateFact), `${privateFact} from the other book is not in the pack`);
  }
  assert.ok(!JSON.stringify(readyPack).includes("NVDA"));
});

test("a Professor reply from the context pack makes no provider request without a model key", async () => {
  for (const env of [{}, { AI_API_KEY: "" }, { AI_API_KEY: "  ", AI_PROVIDER: "openai" }]) {
    const model = createModelAdapter(env);
    assert.equal(model.status, "demonstration");
    const reply = await model.reply("Where is my book concentrated?", readyPack);
    assert.equal(reply.status, "demonstration");
    assert.ok(reply.status === "demonstration" && reply.text.includes("MSFT"));
    assert.ok(reply.status === "demonstration" && !reply.text.includes("NVDA"));
  }
  const keyed = createModelAdapter({ AI_PROVIDER: "openai", AI_API_KEY: "placeholder" });
  assert.equal((await keyed.reply("Where is my book concentrated?", readyPack)).status, "unavailable");
  assert.deepEqual(providerRequests, [], "no provider request was made");
});

test("the stored context record names only the requester's own tickers", () => {
  assert.deepEqual(contextRecord(readyPack), {
    read_at: "2026-11-10T16:00:00.000Z",
    portfolio: "ready",
    holdings: ["MSFT", "XOM"],
    quotes_as_of: "2026-11-10T15:20:00.000Z",
    watchlist: ["SPY", "MSFT"],
  });
  assert.equal(ownerBook.studentId, OWNER.id);
});

test("a Professor request carries only the question", () => {
  assert.deepEqual(parseAsk({ question: "  Am I diversified?  " }), { ok: true, question: "Am I diversified?" });
  const forged = parseAsk({ question: "hi", student_id: OTHER.id, reply: "I am a live model" });
  assert.equal(forged.ok, false);
  assert.ok(!forged.ok && forged.code === "unexpected_field" && forged.fields.includes("student_id"));
  assert.deepEqual(parseAsk({ question: "   " }), { ok: false, code: "invalid_question" });
  assert.deepEqual(parseAsk({ question: "x".repeat(1001) }), { ok: false, code: "invalid_question" });
  assert.deepEqual(parseAsk({ question: 4 }), { ok: false, code: "invalid_request" });
  assert.deepEqual(parseAsk({ question: "buy", order: { side: "buy" } }).ok, false);
});
