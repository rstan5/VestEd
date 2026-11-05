import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreBasisNote } from "@/components/score-basis";
import { applyWindow, sortBoard, type RoundResult } from "./board";
import { buildRows, sampleBoardSources, serverWindowRows, type Board, type BoardSources } from "./board-rows";
import { canonicalLedger, clubStandings, individualStandings, rounds, sampleRoundResults, universityStandings } from "./sample-data";
import { mayaView, rankedStandings } from "./view";

const [roundOne, roundTwo, roundThree] = rounds.filter((round) => round.status === "final");

// Test fixtures only, independent of the sample round results the page uses.
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

test("the competition page path carries two distinct sample rounds and leaves the rest unavailable", () => {
  const [, , , liveRound, scheduledRound] = rounds;
  const pageSources = sampleBoardSources(rankedStandings(mayaView(canonicalLedger).standing));
  for (const board of ["individual", "club", "university"] as const) {
    const { rows } = buildRows(board, pageSources);
    const ids = (round: (typeof rounds)[number]) => {
      const windowed = applyWindow(rows, { kind: "round", round });
      assert.ok(windowed, `${round.name} has sample rows for the ${board} board`);
      const sorted = sortBoard(windowed, "rank");
      for (const row of sorted) assert.equal(row.window.return, sampleRoundResults[board][round.id][row.id].return);
      return sorted.map((row) => row.id);
    };
    const first = ids(roundOne);
    const second = ids(roundTwo);
    assert.equal(first.length, rows.length);
    assert.notDeepEqual(first, second);
    assert.notEqual(first[0], second[0]);
    assert.equal(applyWindow(rows, { kind: "round", round: roundThree }), null);
    assert.equal(applyWindow(rows, { kind: "round", round: scheduledRound }), null);
    assert.ok(applyWindow(rows, { kind: "round", round: liveRound }));
  }
});

test("server window rows keep the server's rank, withheld components, and order through filter and sort", () => {
  const blank = { scoreLabel: null, riskAdjusted: null, consistency: null, institutional: null, included: [] };
  const payload = {
    universities: [{ id: "u1", shortName: "U1" }, { id: "u2", shortName: "U2" }],
    clubs: [],
    windows: {
      season: {
        kind: "provisional" as const,
        asOf: "2026-11-04T21:00:00.000Z",
        boards: {
          individual: [],
          club: [
            { ...blank, entrantId: "big", name: "Big Club", universityId: "u1", clubId: null, rank: 2, return: 0.02, score: 50, drawdown: 0.05, diversification: 0.4, eligibleStudents: 12, withheld: ["riskAdjusted", "consistency"] },
            { ...blank, entrantId: "small", name: "Small Club", universityId: "u2", clubId: null, rank: 1, return: 0.04, score: 60, drawdown: 0.08, diversification: 0.5, eligibleStudents: 3, withheld: ["riskAdjusted", "consistency"] },
            { ...blank, entrantId: "pair", name: "Pair Club", universityId: "u2", clubId: null, rank: null, return: null, score: null, drawdown: null, diversification: null, eligibleStudents: 2, withheld: ["return", "score", "riskAdjusted", "drawdown", "diversification", "consistency"] },
          ],
          university: [],
        },
      },
    },
  };
  assert.equal(serverWindowRows(payload, "club", "fall-2026-r1", null), null, "an unpublished window has no rows");
  const rows = serverWindowRows(payload, "club", "season", null)!;
  assert.deepEqual(rows.map((row) => [row.id, row.window.rank]), [["big", 2], ["small", 1], ["pair", null]], "ranks are taken from the server as published");
  assert.deepEqual(rows.find((row) => row.id === "pair")!.withheld, ["return", "score", "riskAdjusted", "drawdown", "diversification", "consistency"]);
  assert.deepEqual(sortBoard(rows, "rank").map((row) => row.id), ["small", "big", "pair"], "an unranked group sorts after ranked ones");
  const filtered = sortBoard(rows.filter((row) => row.universityId === "u1"), "drawdown");
  assert.deepEqual(filtered.map((row) => [row.id, row.window.rank]), [["big", 2]], "filtering out the leader does not renumber");
});

test("a two-component server score stays Partial and lists its components through the adapter and the score cell", () => {
  const figures = { universityId: "u1", clubId: null, riskAdjusted: null, drawdown: null, consistency: null, eligibleStudents: null, institutional: true, withheld: [] };
  const payload = {
    universities: [{ id: "u1", shortName: "U1" }],
    clubs: [],
    windows: {
      season: {
        kind: "provisional" as const,
        asOf: "2026-11-04T21:00:00.000Z",
        boards: {
          individual: [
            { ...figures, entrantId: "ana", name: "Ana", rank: 1, return: 0.03, score: 71.25, diversification: 0.6, scoreLabel: "Partial", included: ["diversification", "return"] },
            { ...figures, entrantId: "ben", name: "Ben", rank: 2, return: 0.01, score: 64.5, diversification: 0.5, drawdown: 0.02, scoreLabel: "Official", included: ["return", "drawdown", "diversification"] },
            { ...figures, entrantId: "cy", name: "Cy", rank: null, return: null, score: null, diversification: null, scoreLabel: "Unavailable", included: [] },
          ],
          club: [],
          university: [],
        },
      },
    },
  };
  const rows = serverWindowRows(payload, "individual", "season", "ana")!;
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.deepEqual(byId.get("ana")!.scoreBasis, { label: "Partial", included: ["return", "diversification"] });
  assert.deepEqual(byId.get("ben")!.scoreBasis, { label: "Official", included: ["return", "drawdown", "diversification"] });
  assert.equal(byId.get("ana")!.window.score, 71.25, "the server's score is shown as published, not recomputed");

  // tsx compiles components with the classic JSX transform, which reads a global React.
  Object.assign(globalThis, { React });
  const partial = renderToStaticMarkup(createElement(ScoreBasisNote, { basis: byId.get("ana")!.scoreBasis }));
  assert.match(partial, /data-score-label="Partial"/);
  assert.match(partial, />Partial</);
  assert.match(partial, /Uses Return, Diversification/);

  const official = renderToStaticMarkup(createElement(ScoreBasisNote, { basis: byId.get("ben")!.scoreBasis }));
  assert.doesNotMatch(official, />Partial</);
  assert.match(official, /Uses Return, Drawdown, Diversification/);
  assert.equal(renderToStaticMarkup(createElement(ScoreBasisNote, { basis: byId.get("cy")!.scoreBasis })), "");
});
