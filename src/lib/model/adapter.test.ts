import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { ProfessorContext } from "../ai";
import { createModelAdapter } from "./adapter";

const context: ProfessorContext = {
  name: "Maya Chen",
  equity: 100_000,
  cashWeight: 0.1,
  seasonReturn: 0.02,
  relative: 0,
  largest: { ticker: "CAT", weight: 0.2, sector: "Industrials" },
  sectors: ["Industrials"],
  holdings: ["CAT"],
};

let fetchCalls = 0;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("model adapter must not call a provider");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("empty model key gives a labeled demonstration reply without a provider call", async () => {
  for (const env of [{}, { AI_API_KEY: "" }, { AI_API_KEY: " ", AI_PROVIDER: "openai" }]) {
    const model = createModelAdapter(env);
    assert.equal(model.status, "demonstration");
    const reply = await model.reply("Am I diversified?", context);
    assert.equal(reply.status, "demonstration");
    assert.equal(reply.status === "demonstration" && reply.label, "Demonstration reply, not a model call");
    assert.ok(reply.status === "demonstration" && reply.text.includes("CAT"));
    assert.equal("model" in reply, false);
    assert.equal("provider" in reply, false);
  }
  assert.equal(fetchCalls, 0);
});

test("a model key without a connected provider is unavailable and calls nothing", async () => {
  const model = createModelAdapter({ AI_PROVIDER: "openai", AI_API_KEY: "placeholder" });
  assert.equal(model.status, "unavailable");
  const reply = await model.reply("Am I diversified?", context);
  assert.equal(reply.status, "unavailable");
  assert.ok(reply.status === "unavailable" && reply.reason.length > 0);
  assert.equal(fetchCalls, 0);
});
