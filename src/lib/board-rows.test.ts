import assert from "node:assert/strict";
import test from "node:test";
import { applyWindow, sortBoard, type RoundResult } from "./board";
import { buildRows, type Board, type BoardSources } from "./board-rows";
import { clubStandings, individualStandings, rounds, universityStandings } from "./sample-data";

const [roundOne, roundTwo, roundThree] = rounds.filter((round) => round.status === "final");

// Test fixtures only: the sample build stores no finalized round results.
function withRounds<T>(rows: T[], first: number[], second: number[]): Array<T & { rounds: Record<string, RoundResult> }> {
  return rows.map((row, index) => ({
    ...row,
    rounds: {
      [roundOne.id]: { return: first[index], drawdown: 0.01 * (index + 1) },
      [roundTwo.id]: { return: second[index], drawdown: 0.01 * (rows.length - index) },
    },
  }));
}

function ascending(length: number) {
  return Array.from({ length }, (_, index) => 0.01 * (index + 1));
}

function descending(length: number) {
  return ascending(length).reverse();
}

const sources: BoardSources = {
  individual: withRounds(individualStandings, ascending(individualStandings.length), descending(individualStandings.length)),
  clubs: withRounds(clubStandings, ascending(clubStandings.length), descending(clubStandings.length)),
  universities: withRounds(universityStandings, ascending(universityStandings.length), descending(universityStandings.length)),
};

function order(board: Board, roundIndex: 0 | 1, sort: "rank" | "return" | "drawdown" = "rank") {
  const round = [roundOne, roundTwo][roundIndex];
  const { rows } = buildRows(board, sources);
  const windowed = applyWindow(rows, { kind: "round", round });
  assert.ok(windowed, `${round.name} has stored rows for the ${board} board`);
  return sortBoard(windowed, sort);
}

for (const board of ["individual", "club", "university"] as const) {
  test(`the ${board} board adapter keeps stored round results so two rounds order rows differently`, () => {
    const { rows } = buildRows(board, sources);
    assert.ok(rows.length > 1);
    for (const row of rows) assert.ok(row.rounds?.[roundOne.id] && row.rounds?.[roundTwo.id], "round-keyed results survive the adapter");

    const first = order(board, 0);
    const second = order(board, 1);
    const firstIds = first.map((row) => row.id);
    const secondIds = second.map((row) => row.id);
    assert.notDeepEqual(firstIds, secondIds);
    assert.deepEqual(secondIds, [...firstIds].reverse());

    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of first) assert.equal(row.window.return, byId.get(row.id)!.rounds![roundOne.id].return);
    for (const row of second) assert.equal(row.window.return, byId.get(row.id)!.rounds![roundTwo.id].return);
    assert.deepEqual(first.map((row) => row.window.rank), first.map((_, index) => index + 1));

    assert.notDeepEqual(order(board, 0, "drawdown").map((row) => row.id), order(board, 1, "drawdown").map((row) => row.id));
  });
}

test("a round with no stored rows stays unavailable after the adapter", () => {
  for (const board of ["individual", "club", "university"] as const) {
    assert.equal(applyWindow(buildRows(board, sources).rows, { kind: "round", round: roundThree }), null);
    assert.equal(applyWindow(buildRows(board, { individual: individualStandings }).rows, { kind: "round", round: roundOne }), null);
  }
});

test("rows without stored rounds carry no rounds map", () => {
  for (const row of buildRows("individual", { individual: individualStandings }).rows) assert.equal("rounds" in row, false);
});
