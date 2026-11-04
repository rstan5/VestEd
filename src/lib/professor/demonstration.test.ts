import assert from "node:assert/strict";
import { test } from "node:test";
import { createModelAdapter, DEMONSTRATION_LABEL } from "@/lib/model/adapter";
import { demonstrationReply } from "./demonstration";
import { buildContextPack } from "./context";
import { bookFor, OWNER, emptyPack, readyPack, unavailablePack } from "./test-fixtures";

const cashPack = buildContextPack({
  owner: OWNER,
  readAt: new Date("2026-11-10T16:00:00.000Z"),
  book: { status: "ready", book: bookFor(OWNER.id, [], "100000.00") },
  watchlist: { status: "ready", tickers: ["SPY"] },
});

const questions = [
  "Where is my book concentrated?",
  "Am I diversified enough?",
  "How does my book compare with the S&P 500 benchmark?",
  "How should I read the sample headlines and news?",
  "Should I buy more MSFT?",
  "Please sell XOM and cancel my order",
  "What about my watchlist?",
  "Tell me something",
];

// A citation, a vendor or publisher, or a data time would be invented: no source exists.
const forbidden: Array<[string, RegExp]> = [
  ["url", /https?:\/\/|www\.|\.com\b|\.org\b|example\./i],
  ["citation marker", /\[\d+\]|\bsource[s]?:|\bcited?\b|according to/i],
  ["vendor or publisher", /massive|polygon|openai|gpt|reuters|bloomberg|associated press|wall street journal|sample desk|campus markets review|nasdaq|nyse|s&p global/i],
  ["clock time", /\b\d{1,2}:\d{2}\b/],
  ["date", /\b\d{4}-\d{2}-\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i],
  ["freshness", /\bas of\b|\bupdated\b|\bUTC\b|\bET\b|\blive\b(?! or delayed)|\breal-time\b|\bdelayed\b(?! vendor)/i],
];

test("demonstration replies carry no citation, vendor, or freshness", () => {
  for (const pack of [readyPack, cashPack, emptyPack, unavailablePack]) {
    for (const question of questions) {
      const reply = demonstrationReply(question, pack);
      assert.ok(reply.length > 0);
      for (const [label, pattern] of forbidden) {
        assert.doesNotMatch(reply, pattern, `${label} in reply to "${question}" (${pack.portfolio.status}): ${reply}`);
      }
      assert.match(reply, /demonstration reply/i, "the reply says it is a demonstration");
      assert.match(reply, /not a model call/i);
    }
  }
});

test("the adapter reply object has no citation, source, vendor, or timestamp fields", async () => {
  const reply = await createModelAdapter({}).reply("Where is my book concentrated?", readyPack);
  assert.deepEqual(Object.keys(reply).sort(), ["label", "status", "text"]);
  assert.equal(reply.status === "demonstration" && reply.label, DEMONSTRATION_LABEL);
  const unavailable = await createModelAdapter({ AI_API_KEY: "placeholder" }).reply("Where is my book concentrated?", readyPack);
  assert.deepEqual(Object.keys(unavailable).sort(), ["reason", "status"]);
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(unavailable.status === "unavailable" ? unavailable.reason : "", pattern, label);
  }
});

test("a trade request is refused and the reply points to the trade sheet rather than placing anything", () => {
  const reply = demonstrationReply("Should I buy 10 more MSFT?", readyPack);
  assert.match(reply, /cannot place, stage, or cancel an order/);
});

test("replies use the requester's own figures and say when the book is missing", () => {
  assert.match(demonstrationReply("Where is my book concentrated?", readyPack), /MSFT at 16\.4% of equity/);
  assert.match(demonstrationReply("Where is my book concentrated?", readyPack), /XOM is under 2%/);
  assert.match(demonstrationReply("Where is my book concentrated?", emptyPack), /no season book open yet/);
  assert.match(demonstrationReply("What about my watchlist?", readyPack), /You are watching SPY, MSFT\. SPY is not in your book\./);
  assert.match(demonstrationReply("How does my book compare with the S&P 500?", readyPack), /unavailable because no licensed series/);
  assert.match(demonstrationReply("Tell me something", unavailablePack), /not available to me right now/);
  const allCash = demonstrationReply("Where is my book concentrated?", cashPack);
  assert.match(allCash, /all cash at \$100,000\.00\. Nothing is concentrated yet/);
  assert.doesNotMatch(allCash, /top position/);
});
