import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWatchRequest } from "./request";
import { watchlistError } from "./types";

test("a watchlist request carries a symbol only", () => {
  assert.deepEqual(parseWatchRequest({ ticker: " spy " }), { ok: true, ticker: "SPY" });
  assert.deepEqual(parseWatchRequest({ ticker: "brk.b" }), { ok: true, ticker: "BRK.B" });
});

test("an owner or student field is rejected before the database is called", () => {
  const forged = parseWatchRequest({ ticker: "AAPL", student_id: "00000000-0000-4000-8000-000000000000" });
  assert.equal(forged.ok, false);
  assert.equal(!forged.ok && forged.code, "unexpected_field");
  assert.deepEqual(!forged.ok && "fields" in forged && forged.fields, ["student_id"]);
});

test("malformed bodies and symbols are rejected", () => {
  for (const body of [null, "AAPL", [], {}, { ticker: 7 }]) {
    const parsed = parseWatchRequest(body);
    assert.equal(!parsed.ok && parsed.code, "invalid_request");
  }
  for (const ticker of ["", "a b", "<x>", "$AAPL"]) {
    const parsed = parseWatchRequest({ ticker });
    assert.equal(!parsed.ok && parsed.code, "invalid_ticker");
  }
});

test("database error codes map to student-facing messages", () => {
  assert.equal(watchlistError("not_signed_in").status, 401);
  assert.equal(watchlistError("unknown_instrument").status, 422);
  assert.equal(watchlistError("something unexpected").code, "watchlist_unavailable");
});
