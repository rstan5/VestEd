import assert from "node:assert/strict";
import test from "node:test";
import { applyWindow, sortBoard, type StandingMetrics } from "./board";
import type { Round } from "./domain";
import { individualStandings, rounds } from "./sample-data";
import { buildSnapshot } from "./scoring";

const liveRound = rounds.find((round) => round.status === "live") as Round;
const finalRound = rounds.find((round) => round.status === "final") as Round;

function row(id: string, overrides: Partial<StandingMetrics>): StandingMetrics & { id: string } {
  return {
    id,
    seasonReturn: 0,
    roundReturn: 0,
    score: 50,
    riskAdjusted: null,
    drawdown: null,
    diversification: 0.5,
    consistency: null,
    rank: 1,
    previousRank: 1,
    ...overrides,
  };
}

function snapshotFor(path: number[]) {
  return buildSnapshot({
    points: path.map((equity) => ({ equity })),
    benchmark: null,
    holdings: [{ weight: 0.5, sector: "Technology" }, { weight: 0.4, sector: "Energy" }],
    cashWeight: 0.1,
    rounds: [],
    field: { returns: [0.01], risk: [], drawdown: [0.03], relative: [] },
  });
}

test("a smaller positive drawdown ranks ahead of a larger loss", () => {
  const careful = snapshotFor([100, 101, 102, 100, 101, 102, 103, 104, 103, 104, 105]);
  const reckless = snapshotFor([100, 104, 108, 96, 98, 100, 102, 104, 103, 104, 105]);
  assert.ok(careful.drawdown !== null && reckless.drawdown !== null);
  assert.ok(careful.drawdown > 0 && reckless.drawdown > careful.drawdown);
  const rows = applyWindow(
    [
      row("reckless", { drawdown: reckless.drawdown, rank: 1 }),
      row("careful", { drawdown: careful.drawdown, rank: 2 }),
    ],
    { kind: "season" },
  )!;
  assert.deepEqual(sortBoard(rows, "drawdown").map((item) => item.id), ["careful", "reckless"]);
  assert.deepEqual(sortBoard([...rows].reverse(), "drawdown").map((item) => item.id), ["careful", "reckless"]);
});

test("missing metrics sort last instead of counting as zero", () => {
  const rows = applyWindow(
    [row("none", { drawdown: null, rank: 1 }), row("some", { drawdown: 0.08, rank: 2 }), row("small", { drawdown: 0.01, rank: 3 })],
    { kind: "season" },
  )!;
  assert.deepEqual(sortBoard(rows, "drawdown").map((item) => item.id), ["small", "some", "none"]);
});

test("the live round window changes the numbers and the sort basis", () => {
  const season = applyWindow(individualStandings, { kind: "season" })!;
  const round = applyWindow(individualStandings, { kind: "round", round: liveRound })!;
  const seasonOrder = sortBoard(season, "rank").map((item) => item.investorId);
  const roundOrder = sortBoard(round, "rank").map((item) => item.investorId);
  assert.notDeepEqual(roundOrder, seasonOrder);

  const byReturn = [...individualStandings].sort((a, b) => b.roundReturn - a.roundReturn || a.rank - b.rank).map((item) => item.investorId);
  assert.deepEqual(roundOrder, byReturn);
  for (const item of round) {
    assert.equal(item.window.return, item.roundReturn);
    assert.equal(item.window.score, null);
    assert.equal(item.window.drawdown, null);
    assert.equal(item.window.previousRank, null);
  }
  assert.deepEqual(sortBoard(round, "return").map((item) => item.investorId), byReturn);
});

test("filtering a window does not renumber its rank", () => {
  const round = applyWindow(individualStandings, { kind: "round", round: liveRound })!;
  const ranks = new Map(round.map((item) => [item.investorId, item.window.rank]));
  const filtered = round.filter((item) => item.investorId.startsWith("s") || item.investorId.startsWith("m"));
  for (const item of sortBoard(filtered, "return")) assert.equal(item.window.rank, ranks.get(item.investorId));
  assert.deepEqual([...ranks.values()].sort((a, b) => a - b), individualStandings.map((_, index) => index + 1));
});

test("a round with no stored results has no window rows", () => {
  assert.equal(applyWindow(individualStandings, { kind: "round", round: finalRound }), null);
});

test("sample drawdowns are stored as positive losses", () => {
  for (const item of individualStandings) assert.ok(item.drawdown === null || item.drawdown >= 0);
});
