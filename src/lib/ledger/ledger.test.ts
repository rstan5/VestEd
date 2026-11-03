import assert from "node:assert/strict";
import { test } from "node:test";
import { buyReserve, reconcileBook, valueLedgerBook } from "./book";
import { ledgerError, ledgerErrorFrom } from "./errors";
import { parseOrderRequest } from "./request";
import type { LedgerBook, LedgerOrder } from "./types";

const valid = { instrument: "CAT", side: "buy", quantity: 10, idempotencyKey: "order-0001" };

test("an order request carries only instrument, side, quantity, and an idempotency key", () => {
  assert.deepEqual(parseOrderRequest(valid), { ok: true, data: valid });
  for (const field of ["price", "fillPrice", "cash", "balance", "accountId", "studentId", "acceptedAt", "submittedAt", "leverage", "margin"]) {
    const parsed = parseOrderRequest({ ...valid, [field]: field === "accountId" ? "someone-else" : 1 });
    assert.deepEqual(parsed, { ok: false, code: "unexpected_field", fields: [field] }, field);
  }
});

test("a malformed request is rejected by shape before it reaches the ledger", () => {
  assert.equal(parseOrderRequest(null).ok, false);
  assert.deepEqual(parseOrderRequest({ ...valid, quantity: "10" }), { ok: false, code: "invalid_request", fields: ["quantity"] });
  assert.deepEqual(parseOrderRequest({ ...valid, idempotencyKey: "short" }), { ok: false, code: "invalid_request", fields: ["idempotencyKey"] });
  assert.deepEqual(parseOrderRequest({ instrument: "CAT", side: "buy", quantity: 1 }), { ok: false, code: "invalid_request", fields: ["idempotencyKey"] });
});

test("the buy reserve includes the collar and one cent per share, rounded up to the cent", () => {
  assert.equal(buyReserve(10, "392.50"), "4121.35");
  assert.equal(buyReserve(5, "100.00"), "525.05");
  assert.equal(buyReserve(95, "1000.00"), "99750.95");
  assert.equal(buyReserve(7, "123.4567"), "907.48");
});

test("ledger error codes map to plain messages and fall back to unavailable", () => {
  assert.equal(ledgerError("insufficient_cash").status, 422);
  assert.equal(ledgerError("idempotency_conflict").status, 409);
  assert.equal(ledgerErrorFrom({ message: "something unexpected" }).code, "ledger_unavailable");
  assert.equal(ledgerErrorFrom(null).code, "ledger_unavailable");
});

function order(overrides: Partial<LedgerOrder>): LedgerOrder {
  return {
    id: "o1",
    studentId: "s1",
    instrumentId: "CAT",
    side: "buy",
    quantity: 10,
    status: "filled",
    idempotencyKey: "order-0001",
    acceptedAt: "2026-11-02T15:00:00.000Z",
    eligibleAt: "2026-11-02T15:15:00.000Z",
    expiresAt: "2026-11-02T21:00:00.000Z",
    referencePrice: "392.5000",
    reservation: { kind: "cash", amount: "4121.35", held: false, releasedAt: "2026-11-02T15:16:00.000Z", releaseReason: "filled" },
    execution: {
      id: "e1",
      orderId: "o1",
      quoteId: "q1",
      price: "392.5000",
      gross: "3925.00",
      simulationCost: "0.10",
      netCash: "-3925.10",
      realized: null,
      executedAt: "2026-11-02T15:16:00.000Z",
    },
    closedAt: "2026-11-02T15:16:00.000Z",
    reason: null,
    ...overrides,
  };
}

function sampleBook(): LedgerBook {
  return {
    registrationId: "r1",
    studentId: "s1",
    seasonId: "fall-2026",
    seasonName: "Fall 2026",
    startingCapital: "100000.00",
    cash: "96074.90",
    registeredAt: "2026-11-02T14:00:00.000Z",
    positions: [{ instrumentId: "CAT", quantity: "10", costBasis: "3925.10" }],
    orders: [
      order({}),
      order({
        id: "o2",
        status: "accepted",
        quantity: 2,
        execution: null,
        closedAt: null,
        reservation: { kind: "cash", amount: "824.27", held: true, releasedAt: null, releaseReason: null },
      }),
    ],
    cashLines: [
      { id: 1, kind: "opening", amount: "100000.00", orderId: null, memo: "Season starting capital", createdAt: "2026-11-02T14:00:00.000Z" },
      { id: 2, kind: "trade", amount: "-3925.00", orderId: "o1", memo: "Bought", createdAt: "2026-11-02T15:16:00.000Z" },
      { id: 3, kind: "simulation_cost", amount: "-0.10", orderId: "o1", memo: "Cost", createdAt: "2026-11-02T15:16:00.000Z" },
    ],
    quotes: { CAT: { instrumentId: "CAT", price: "399.0000", asOf: "2026-11-02T15:18:00.000Z", source: "sample" } },
    instruments: [{ id: "CAT", name: "Caterpillar", kind: "stock", sector: "Industrials" }],
  };
}

test("a book is valued as cash plus shares at the stored quote, with held cash still counted as cash", () => {
  const valuation = valueLedgerBook(sampleBook());
  assert.equal(valuation.equity, "100064.90");
  assert.equal(valuation.invested, "3990.00");
  assert.equal(valuation.reservedCash, "824.27");
  assert.equal(valuation.availableCash, "95250.63");
  assert.equal(valuation.unrealized, "64.90");
  assert.equal(valuation.seasonReturn, "0.000649");
  assert.equal(valuation.positions[0]?.averageCost, "392.5100");
  assert.equal(valuation.positions[0]?.weight, "0.039874");
  assert.deepEqual(valuation.quoteSources, ["sample"]);
});

test("a holding with no stored quote makes equity and return unavailable rather than zero", () => {
  const book = { ...sampleBook(), quotes: {} };
  const valuation = valueLedgerBook(book);
  assert.equal(valuation.equity, null);
  assert.equal(valuation.seasonReturn, null);
  assert.deepEqual(valuation.missingQuotes, ["CAT"]);
  assert.equal(valuation.positions[0]?.marketValue, null);
});

test("reconciliation passes for a consistent book and catches a cash mismatch or a stuck reserve", () => {
  const book = sampleBook();
  book.orders = [book.orders[0]];
  assert.equal(reconcileBook(book).ok, true);

  const drifted = { ...book, cash: "96174.90" };
  assert.equal(reconcileBook(drifted).cashMatchesLedger, false);
  assert.equal(reconcileBook(drifted).ok, false);

  const stuck = { ...book, orders: [order({ status: "cancelled", execution: null, reservation: { kind: "cash", amount: "10.00", held: true, releasedAt: null, releaseReason: null } })] };
  assert.equal(reconcileBook(stuck).heldByClosedOrders, 1);
  assert.equal(reconcileBook(stuck).ok, false);
});
