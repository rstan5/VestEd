import assert from "node:assert/strict";
import test from "node:test";
import {
  SCORE_WEIGHTS,
  buildSnapshot,
  compositeScore,
  consistencyScore,
  diversificationScore,
  fieldPercentiles,
  maxDrawdown,
  percentile,
  periodReturn,
  riskAdjusted,
  timeWeightedReturn,
  volatility,
} from "./scoring";
import { placeOrder, valueBook } from "./portfolio";
import { canonicalLedger, securities } from "./sample-data";
import type { Ledger } from "./domain";

const close = (actual: number | null, expected: number, epsilon = 1e-9) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < epsilon, `${actual} is not ${expected}`);
};

function flatPath(length: number, start = 100): number[] {
  return Array.from({ length }, () => start);
}

function wavyPath(length: number, start = 100): number[] {
  const values = [start];
  for (let i = 1; i < length; i += 1) values.push(values[i - 1] * (1 + (i % 3 === 0 ? -0.004 : 0.003)));
  return values;
}

test("period return is ending over starting minus one", () => {
  assert.ok(Math.abs(periodReturn(100, 110) - 0.1) < 1e-10);
});

test("time-weighted return chain-links around an external deposit", () => {
  const twr = timeWeightedReturn([
    { equity: 100 },
    { equity: 120, flows: [{ kind: "funding", amount: 10 }] },
    { equity: 132 },
  ]);
  close(twr, 0.21);
});

test("a deposit-sized buy and a dividend with no market move leave time-weighted return unchanged", () => {
  const capital = 100_000;
  const twr = timeWeightedReturn([
    { equity: capital, flows: [{ kind: "funding", amount: capital }] },
    { equity: capital, flows: [{ kind: "trade", amount: -capital }] },
    { equity: capital, flows: [{ kind: "dividend", amount: 420 }] },
    { equity: capital },
  ]);
  close(twr, 0);
});

test("trades inside a moving window do not change time-weighted return", () => {
  const plain = timeWeightedReturn([{ equity: 100_000 }, { equity: 101_000 }, { equity: 102_010 }]);
  const traded = timeWeightedReturn([
    { equity: 100_000 },
    { equity: 101_000, flows: [{ kind: "trade", amount: -60_000 }] },
    { equity: 102_010, flows: [{ kind: "dividend", amount: 85 }] },
  ]);
  close(plain, 0.0201);
  close(traded, 0.0201);
});

test("time-weighted return is unavailable with fewer than two valuations", () => {
  assert.equal(timeWeightedReturn([{ equity: 100_000 }]), null);
});

test("drawdown is a positive loss", () => {
  const values = [100, 104, 110, 99, 101, 105, 108, 107, 109, 111, 112];
  close(maxDrawdown(values), 0.1);
});

test("drawdown needs 10 return intervals", () => {
  assert.equal(maxDrawdown([100, 99, 98, 97]), null);
  assert.equal(maxDrawdown(flatPath(10)), null);
  close(maxDrawdown(flatPath(11)), 0);
});

test("risk-adjusted return needs 20 return intervals", () => {
  const short = Array.from({ length: 8 }, (_, index) => 100 + index);
  assert.equal(riskAdjusted(short, short), null);
  const bench = wavyPath(21).map((value) => value * 0.999);
  assert.equal(riskAdjusted(wavyPath(20), bench), null);
  assert.notEqual(riskAdjusted(wavyPath(21), bench.map((value, index) => value * (1 - index * 0.0001))), null);
});

test("volatility needs 20 return intervals", () => {
  assert.equal(volatility(wavyPath(20)), null);
  assert.notEqual(volatility(wavyPath(21)), null);
});

test("consistency needs 2 finalized rounds and ignores provisional ones", () => {
  assert.equal(consistencyScore([{ status: "final", excessReturn: 0.01 }, { status: "provisional", excessReturn: 0.02 }]), null);
  assert.equal(consistencyScore([{ status: "final", excessReturn: 0.01 }, { status: "final", excessReturn: null }]), null);
  close(consistencyScore([{ status: "final", excessReturn: 0.01 }, { status: "final", excessReturn: -0.01 }]), 0.25);
});

test("a field of one has no percentile", () => {
  assert.equal(percentile(0.05, []), null);
  assert.deepEqual(fieldPercentiles([0.05]), [null]);
  assert.deepEqual(fieldPercentiles([0.05, null]), [null, null]);
});

test("tied fields use the mid-rank percentile", () => {
  assert.deepEqual(fieldPercentiles([0.02, 0.02, 0.02]), [0.5, 0.5, 0.5]);
  assert.deepEqual(fieldPercentiles([0.1, 0.2, 0.2, 0.3]), [0, 0.5, 0.5, 1]);
  assert.equal(percentile(0.2, [0.1, 0.2, 0.3]), 0.5);
});

test("lower drawdown earns the higher percentile", () => {
  assert.deepEqual(fieldPercentiles([0.02, 0.1, 0.05], "lower"), [1, 0, 0.5]);
});

test("weights stay 30, 20, 15, 15, 10, 10", () => {
  assert.deepEqual(SCORE_WEIGHTS, { return: 0.3, risk: 0.2, drawdown: 0.15, diversification: 0.15, consistency: 0.1, relative: 0.1 });
});

test("missing components are dropped and the remaining weights renormalized", () => {
  const result = compositeScore({
    returnPct: 0.08,
    returnField: [0.01, 0.02, 0.03],
    riskAdjusted: null,
    riskField: [],
    drawdown: 0.02,
    drawdownField: [0.05, 0.06, 0.07],
    diversification: 0.6,
    consistency: null,
    relative: null,
    relativeField: [],
    benchmarkLicensed: false,
  });
  assert.deepEqual(result.included, ["return", "drawdown", "diversification"]);
  assert.equal(result.label, "Official");
  close(result.score, Math.round(((1 * 0.3 + 1 * 0.15 + 0.6 * 0.15) / 0.6) * 1000) / 10, 1e-6);
  const byKey = Object.fromEntries(result.components.map((item) => [item.key, item]));
  assert.equal(byKey.risk.value, null);
  assert.equal(byKey.risk.availability, "unavailable");
  assert.equal(byKey.consistency.availability, "unavailable");
  assert.equal(byKey.relative.availability, "unavailable");
  assert.ok(result.components.every((item) => item.value !== 0 || item.availability === "official"));
});

test("relative return stays unavailable without a licensed benchmark", () => {
  const result = compositeScore({
    returnPct: 0.08,
    returnField: [0.01],
    riskAdjusted: 1.2,
    riskField: [0.8],
    drawdown: 0.02,
    drawdownField: [0.05],
    diversification: 0.6,
    consistency: 0.5,
    relative: 0.03,
    relativeField: [0.01],
    benchmarkLicensed: false,
  });
  const relative = result.components.find((item) => item.key === "relative")!;
  assert.equal(relative.value, null);
  assert.equal(relative.availability, "unavailable");
  assert.ok(!result.included.includes("relative"));
});

test("fewer than three components is Partial and still lists what was included", () => {
  const result = compositeScore({
    returnPct: 0.08,
    returnField: [0.01, 0.2],
    riskAdjusted: null,
    riskField: [],
    drawdown: null,
    drawdownField: [],
    diversification: 0.4,
    consistency: null,
    relative: null,
    relativeField: [],
    benchmarkLicensed: false,
  });
  assert.equal(result.label, "Partial");
  assert.deepEqual(result.included, ["return", "diversification"]);
  close(result.score, Math.round(((0.5 * 0.3 + 0.4 * 0.15) / 0.45) * 1000) / 10, 1e-6);
  const drawdown = result.components.find((item) => item.key === "drawdown")!;
  assert.equal(drawdown.availability, "insufficient");
});

test("a self-only field does not give a return percentile", () => {
  const result = compositeScore({
    returnPct: 0.08,
    returnField: [],
    riskAdjusted: null,
    riskField: [],
    drawdown: 0.02,
    drawdownField: [],
    diversification: 0.4,
    consistency: null,
    relative: null,
    relativeField: [],
    benchmarkLicensed: false,
  });
  const ret = result.components.find((item) => item.key === "return")!;
  assert.equal(ret.value, null);
  assert.equal(ret.availability, "unavailable");
  assert.deepEqual(result.included, ["diversification"]);
  assert.equal(result.label, "Partial");
});

test("short samples are unavailable and omitted from the composite", () => {
  const snapshot = buildSnapshot({
    points: wavyPath(10).map((equity) => ({ equity })),
    benchmark: { licensed: true, values: wavyPath(10).map((value) => value * 0.999) },
    holdings: [{ weight: 0.5, sector: "Technology" }, { weight: 0.4, sector: "Energy" }],
    cashWeight: 0.1,
    rounds: [{ status: "final", excessReturn: 0.01 }, { status: "provisional", excessReturn: 0.02 }],
    field: { returns: [0.001, 0.002], risk: [0.5], drawdown: [0.01], relative: [0.0] },
  });
  assert.equal(snapshot.riskAdjusted, null);
  assert.equal(snapshot.volatility, null);
  assert.equal(snapshot.drawdown, null);
  assert.equal(snapshot.consistency, null);
  assert.equal(snapshot.observations, 9);
  const byKey = Object.fromEntries(snapshot.components.map((item) => [item.key, item]));
  for (const key of ["risk", "drawdown", "consistency"]) {
    assert.equal(byKey[key].value, null);
    assert.equal(byKey[key].availability, "insufficient");
    assert.ok(!snapshot.included.includes(key as never));
  }
  assert.deepEqual(snapshot.included, ["return", "diversification", "relative"]);
});

test("a snapshot without a licensed benchmark has no relative, risk-adjusted, or consistency figure", () => {
  const snapshot = buildSnapshot({
    points: wavyPath(30).map((equity) => ({ equity })),
    benchmark: null,
    holdings: [{ weight: 0.5, sector: "Technology" }, { weight: 0.4, sector: "Energy" }],
    cashWeight: 0.1,
    rounds: [{ status: "final", excessReturn: 0.01 }, { status: "final", excessReturn: 0.02 }],
    field: { returns: [0.001, 0.002], risk: [0.5], drawdown: [0.01, 0.02], relative: [0.0] },
  });
  assert.equal(snapshot.relative, null);
  assert.equal(snapshot.riskAdjusted, null);
  assert.equal(snapshot.consistency, null);
  assert.notEqual(snapshot.drawdown, null);
  assert.ok((snapshot.drawdown as number) > 0);
  assert.deepEqual(snapshot.included, ["return", "drawdown", "diversification"]);
  assert.equal(snapshot.scoreLabel, "Official");
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
