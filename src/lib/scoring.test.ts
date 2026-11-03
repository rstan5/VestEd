import assert from "node:assert/strict";
import test from "node:test";
import { diversificationScore, maxDrawdown, periodReturn, riskAdjusted } from "./scoring";
import { placeOrder, valueBook } from "./portfolio";
import { canonicalLedger, securities } from "./sample-data";
import type { Ledger } from "./domain";

test("period return is ending over starting minus one", () => {
  assert.ok(Math.abs(periodReturn(100, 110) - 0.1) < 1e-10);
});

test("drawdown stays unpublished below 10 observations", () => {
  assert.equal(maxDrawdown([100, 99, 98, 97]), null);
});

test("token holdings do not raise diversification", () => {
  const ignored = diversificationScore(
    [
      { weight: 0.9, sector: "Technology" },
      { weight: 0.004, sector: "Energy" },
      { weight: 0.004, sector: "Financials" },
      { weight: 0.004, sector: "Health care" },
    ],
    0.08,
  );
  const real = diversificationScore(
    [
      { weight: 0.2, sector: "Technology" },
      { weight: 0.2, sector: "Energy" },
      { weight: 0.2, sector: "Financials" },
      { weight: 0.2, sector: "Health care" },
    ],
    0.08,
  );
  assert.ok(real > ignored);
});

test("risk-adjusted return needs 20 observations", () => {
  const short = Array.from({ length: 8 }, (_, index) => 100 + index);
  assert.equal(riskAdjusted(short, short), null);
});

test("buy over cash is rejected and does not change the book", () => {
  const before = structuredClone(canonicalLedger) as Ledger;
  const result = placeOrder(before, securities, { ticker: "LLY", side: "buy", quantity: 100, clientOrderId: "too-big", submittedAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(result.accepted, false);
  assert.equal(result.ledger.cash, before.cash);
  assert.equal(result.order.status, "rejected");
});

test("sell cannot exceed the position", () => {
  const result = placeOrder(canonicalLedger, securities, { ticker: "CAT", side: "sell", quantity: 500, clientOrderId: "too-many", submittedAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(result.accepted, false);
  assert.match(result.order.reason, /Short selling/);
});

test("a valid buy reduces cash and uses the spread", () => {
  const result = placeOrder(canonicalLedger, securities, { ticker: "XOM", side: "buy", quantity: 2, clientOrderId: "xom-2", submittedAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(result.accepted, true);
  assert.ok(result.order.fillPrice! > result.order.quotePrice);
  assert.ok(result.ledger.cash < canonicalLedger.cash);
  const book = valueBook(result.ledger, securities);
  assert.ok(book.positions.some((position) => position.ticker === "XOM" && position.quantity === 42));
});

test("duplicate order ids are not filled twice", () => {
  const once = placeOrder(canonicalLedger, securities, { ticker: "XOM", side: "buy", quantity: 1, clientOrderId: "same", submittedAt: "2026-11-02T12:00:00.000Z" });
  const twice = placeOrder(once.ledger, securities, { ticker: "XOM", side: "buy", quantity: 1, clientOrderId: "same", submittedAt: "2026-11-02T12:01:00.000Z" });
  assert.equal(twice.accepted, false);
});
