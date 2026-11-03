import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleAt, newYorkSessionClock } from "./clock";
import { closeDueRounds } from "./round-close";
import { createFixtureStore, type FixtureSeed } from "./fixture-store";
import { SAMPLE_JOB_NOW, sampleJobSeed } from "./fixtures";
import { fillEligibleOrders } from "./fill";
import { runJobsOnce, startJobTimer } from "./run";
import { valueAccounts } from "./valuation";

const clock = newYorkSessionClock({ closedDates: ["2026-11-26"], earlyCloses: { "2026-11-27": "13:00" } });

function seed(overrides: Partial<FixtureSeed> = {}): FixtureSeed {
  return { ...sampleJobSeed(), ...overrides };
}

test("one invocation of the fill job fills an eligible sample fixture order", async () => {
  const store = createFixtureStore(seed());
  assert.equal(store.label, "sample");

  const result = await fillEligibleOrders({ store, clock, now: new Date(SAMPLE_JOB_NOW) });

  assert.deepEqual(result.filled, [{ orderId: "ord-1", quoteId: "q-fill", price: "392.50", filledAt: "2026-11-02T15:16:00.000Z" }]);
  assert.deepEqual(result.waiting, []);
  const order = store.order("ord-1");
  assert.equal(order?.status, "filled");
  assert.equal(order?.fillQuoteId, "q-fill");
  const account = store.account("acct-1");
  assert.equal(account?.cash, "96074.90");
  assert.equal(account?.reservedCash, "0.00");
  assert.deepEqual(account?.positions, [{ instrumentId: "CAT", quantity: "10", cost: "3925.10" }]);
});

test("a second invocation does not fill the same order again", async () => {
  const store = createFixtureStore(seed());
  const now = new Date("2026-11-02T15:20:00.000Z");
  await fillEligibleOrders({ store, clock, now });
  const again = await fillEligibleOrders({ store, clock, now });
  assert.deepEqual(again.filled, []);
  assert.equal(store.account("acct-1")?.cash, "96074.90");
});

test("an order inside its 15-minute wait is not filled", async () => {
  const store = createFixtureStore(seed());
  const result = await fillEligibleOrders({ store, clock, now: new Date("2026-11-02T15:14:00.000Z") });
  assert.deepEqual(result.filled, []);
  assert.deepEqual(result.waiting, ["ord-1"]);
  assert.equal(store.order("ord-1")?.status, "accepted");
});

test("a weekend order waits for the next open and never uses an older quote", async () => {
  const store = createFixtureStore(
    seed({
      orders: [{ ...seed().orders[0], acceptedAt: "2026-11-07T17:00:00.000Z" }],
      quotes: [
        { id: "q-friday", instrumentId: "CAT", price: "380.00", asOf: "2026-11-06T20:59:00.000Z" },
        { id: "q-open", instrumentId: "CAT", price: "385.00", asOf: "2026-11-09T14:30:00.000Z" },
      ],
    }),
  );
  const early = await fillEligibleOrders({ store, clock, now: new Date("2026-11-09T14:00:00.000Z") });
  assert.deepEqual(early.waiting, ["ord-1"]);
  const result = await fillEligibleOrders({ store, clock, now: new Date("2026-11-09T14:45:00.000Z") });
  assert.equal(result.filled[0]?.quoteId, "q-open");
});

test("an unfilled day order expires at the close", async () => {
  const store = createFixtureStore(seed({ quotes: [] }));
  const before = await fillEligibleOrders({ store, clock, now: new Date("2026-11-02T20:59:00.000Z") });
  assert.deepEqual(before.waiting, ["ord-1"]);
  const after = await fillEligibleOrders({ store, clock, now: new Date("2026-11-02T21:00:00.000Z") });
  assert.deepEqual(after.expired, ["ord-1"]);
  assert.equal(store.order("ord-1")?.status, "expired");
  assert.equal(store.account("acct-1")?.reservedCash, "0.00");
});

test("a fill whose debit exceeds the reserve is rejected and releases the reserve", async () => {
  const base = seed();
  const store = createFixtureStore(
    seed({
      accounts: [{ ...base.accounts[0], reservedCash: "3900.00" }],
      orders: [{ ...base.orders[0], reservedCash: "3900.00" }],
    }),
  );
  const result = await fillEligibleOrders({ store, clock, now: new Date("2026-11-02T15:20:00.000Z") });
  assert.equal(result.rejected[0]?.orderId, "ord-1");
  assert.equal(store.order("ord-1")?.status, "rejected");
  assert.equal(store.account("acct-1")?.cash, "100000.00");
  assert.equal(store.account("acct-1")?.reservedCash, "0.00");
});

test("eligibility respects DST, holidays, and early closes", () => {
  assert.equal(eligibleAt("2026-11-02T15:00:00.000Z", clock).eligibleAt.toISOString(), "2026-11-02T15:15:00.000Z");
  assert.equal(eligibleAt("2026-11-02T20:50:00.000Z", clock).eligibleAt.toISOString(), "2026-11-03T14:30:00.000Z");
  assert.equal(eligibleAt("2026-07-01T12:00:00.000Z", clock).eligibleAt.toISOString(), "2026-07-01T13:30:00.000Z");
  const holiday = eligibleAt("2026-11-26T15:00:00.000Z", clock);
  assert.equal(holiday.eligibleAt.toISOString(), "2026-11-27T14:30:00.000Z");
  assert.equal(holiday.session.close.toISOString(), "2026-11-27T18:00:00.000Z");
});

test("valuation marks an account unavailable when a holding has no quote", async () => {
  const store = createFixtureStore(
    seed({
      orders: [],
      accounts: [
        { accountId: "acct-1", cash: "1000.00", reservedCash: "0", positions: [{ instrumentId: "CAT", quantity: "2", cost: "780.02" }] },
        { accountId: "acct-2", cash: "50.00", reservedCash: "0", positions: [{ instrumentId: "NONE", quantity: "1", cost: "10.00" }] },
      ],
    }),
  );
  const result = await valueAccounts({ store, clock, now: new Date("2026-11-02T15:17:00.000Z") });
  assert.deepEqual(result.snapshots, [
    { accountId: "acct-1", valuedAt: "2026-11-02T15:17:00.000Z", status: "valued", equity: "1785.00", missing: [] },
    { accountId: "acct-2", valuedAt: "2026-11-02T15:17:00.000Z", status: "unavailable", equity: null, missing: ["NONE"] },
  ]);
  assert.equal(store.snapshots().length, 2);
});

test("round close finalizes a due round once", async () => {
  const store = createFixtureStore(
    seed({
      rounds: [
        { id: "r1", endsAt: "2026-11-20T21:00:00.000Z", status: "open" },
        { id: "r2", endsAt: "2026-12-11T21:00:00.000Z", status: "open" },
      ],
    }),
  );
  const now = new Date("2026-11-20T21:05:00.000Z");
  assert.deepEqual((await closeDueRounds({ store, clock, now })).finalized, ["r1"]);
  assert.deepEqual((await closeDueRounds({ store, clock, now })).finalized, []);
  assert.equal(store.round("r2")?.status, "open");
});

test("runJobsOnce runs fill, valuation, and round close in one call", async () => {
  const store = createFixtureStore(seed());
  const result = await runJobsOnce({ store, clock, now: new Date("2026-11-02T15:20:00.000Z") });
  assert.equal(result.fill.filled[0]?.orderId, "ord-1");
  assert.equal(result.valuation.snapshots[0]?.equity, "100064.90");
  assert.deepEqual(result.roundClose.finalized, []);
});

test("the local timer calls the same one-shot job and stops cleanly", async () => {
  const store = createFixtureStore(seed());
  let ticks = 0;
  const timer = startJobTimer(() => ({ store, clock, now: new Date("2026-11-02T15:20:00.000Z") }), 5, {
    onResult: () => {
      ticks += 1;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await timer.stop();
  assert.ok(ticks >= 1);
  assert.equal(store.order("ord-1")?.status, "filled");
  const settled = ticks;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(ticks, settled);
});
