import assert from "node:assert/strict";
import test from "node:test";
import { STARTING_CAPITAL, type Ledger } from "./domain";
import { placeOrder } from "./portfolio";
import { canonicalLedger, securities } from "./sample-data";

function cents(value: number): number {
  return Math.round(value * 100);
}

function reconciliationGap(ledger: Ledger): number {
  const cost = ledger.positions.reduce((sum, position) => sum + cents(position.quantity * position.averageCost), 0);
  return cents(ledger.cash) + cost - cents(STARTING_CAPITAL) - cents(ledger.realizedGain);
}

test("the sample book reconciles cash plus position cost to starting capital plus realized gain", () => {
  assert.equal(reconciliationGap(canonicalLedger), 0);
});

test("the sample book still reconciles after a sample sell realizes against average cost", () => {
  const result = placeOrder(canonicalLedger, securities, { ticker: "AAPL", side: "sell", quantity: 5, clientOrderId: "sample-trim", submittedAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(result.accepted, true);
  assert.equal(reconciliationGap(result.ledger), 0);
});

test("the reconciliation check catches a sample book with drifted cash", () => {
  assert.notEqual(reconciliationGap({ ...canonicalLedger, cash: canonicalLedger.cash + 1 }), 0);
});
