import assert from "node:assert/strict";
import test from "node:test";
import { computeStandings, groupComponent, individualStandings, officialRanks, type StudentWindowInput } from "./compute";
import { currentEditions, lifetimeRecords, type FinalizedResult } from "./lifetime";
import { entryPayloads, standingsFor, type SeasonInputs } from "./store";
import { windowPath, type BookHistory } from "./window";

const clubs = [
  { id: "small-club", name: "Small Club", universityId: "small-u" },
  { id: "big-club", name: "Big Club", universityId: "big-u" },
];
const universities = [
  { id: "small-u", name: "Small University" },
  { id: "big-u", name: "Big University" },
];

function student(id: string, path: number[] | null, overrides: Partial<StudentWindowInput> = {}): StudentWindowInput {
  return {
    id,
    name: id,
    participated: true,
    universityId: null,
    clubId: null,
    points: path ? path.map((equity) => ({ equity })) : null,
    holdings: path ? [{ weight: 0.5, sector: "Technology" }, { weight: 0.45, sector: "Energy" }] : null,
    cashWeight: path ? 0.05 : null,
    ...overrides,
  };
}

const member = (id: string, university: string, club: string | null, path: number[] | null) =>
  student(id, path, { universityId: university, clubId: club });

test("VAL-BOARD-001: identical per-student results give the same group score for a small and a large group", () => {
  const small = ["s1", "s2", "s3"].map((id) => member(id, "small-u", "small-club", [100_000, 105_000]));
  const big = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"].map((id) => member(id, "big-u", "big-club", [100_000, 105_000]));
  const boards = computeStandings([...small, ...big], { clubs, universities });

  for (const board of [boards.club, boards.university]) {
    const [first, second] = board;
    assert.equal(board.length, 2);
    assert.ok(first.return !== null && Math.abs(first.return - 0.05) < 1e-12, "the group return is a mean, not a sum of members");
    assert.equal(first.return, second.return);
    assert.equal(first.score, second.score);
    assert.equal(first.rank, second.rank, "equal results share the official rank");
  }
  assert.deepEqual(
    boards.university.map((row) => [row.entrantId, row.eligibleStudents]).sort(),
    [["big-u", 9], ["small-u", 3]],
  );
});

test("VAL-BOARD-001: a larger book and a duplicate affiliation do not change a member's weight", () => {
  const base = [
    member("a", "small-u", "small-club", [100_000, 102_000]),
    member("b", "small-u", "small-club", [100_000, 104_000]),
    member("c", "small-u", "small-club", [100_000, 109_000]),
  ];
  const before = computeStandings(base, { clubs, universities });
  // c's book is ten times larger with the same return, and c is listed twice.
  const scaled = [base[0], base[1], member("c", "small-u", "small-club", [1_000_000, 1_090_000]), member("c", "small-u", "small-club", [1_000_000, 1_090_000])];
  const after = computeStandings(scaled, { clubs, universities });

  const mean = (0.02 + 0.04 + 0.09) / 3;
  for (const board of ["club", "university"] as const) {
    assert.ok(Math.abs((before[board][0].return as number) - mean) < 1e-12);
    assert.ok(Math.abs((after[board][0].return as number) - mean) < 1e-12);
    assert.equal(after[board][0].eligibleStudents, 3, "a duplicate affiliation counts once");
    assert.deepEqual([...after[board][0].memberIds].sort(), ["a", "b", "c"]);
  }
  assert.equal(after.individual.length, 3, "the duplicate student has one individual row");
});

test("VAL-BOARD-002: a component needs three eligible students and complete coverage", () => {
  const two = groupComponent([0.03, 0.05]);
  assert.deepEqual([two.status, two.reason, two.value], ["withheld", "too_few_students", null]);

  const missing = groupComponent([0.03, 0.05, null]);
  assert.deepEqual([missing.status, missing.reason, missing.value, missing.covered, missing.eligible], ["withheld", "incomplete_coverage", null, 2, 3]);

  const complete = groupComponent([0.03, 0.05, 0.01]);
  assert.equal(complete.status, "official");
  assert.ok(Math.abs((complete.value as number) - 0.03) < 1e-12);
});

test("VAL-BOARD-002: group boards withhold a two-student group and a group with a missing member, and publish a complete one", () => {
  const directory = {
    clubs: [
      { id: "pair", name: "Pair", universityId: "u2" },
      { id: "gap", name: "Gap", universityId: "u3" },
      { id: "full", name: "Full", universityId: "u4" },
    ],
    universities: [
      { id: "u2", name: "Two" },
      { id: "u3", name: "Gap U" },
      { id: "u4", name: "Full U" },
    ],
  };
  const boards = computeStandings(
    [
      member("p1", "u2", "pair", [100_000, 101_000]),
      member("p2", "u2", "pair", [100_000, 103_000]),
      member("g1", "u3", "gap", [100_000, 110_000]),
      member("g2", "u3", "gap", [100_000, 108_000]),
      member("g3", "u3", "gap", null),
      member("f1", "u4", "full", [100_000, 99_000]),
      member("f2", "u4", "full", [100_000, 100_000]),
      member("f3", "u4", "full", [100_000, 101_000]),
    ],
    directory,
  );
  const club = new Map(boards.club.map((row) => [row.entrantId, row]));
  assert.equal(club.get("pair")!.return, null);
  assert.equal(club.get("pair")!.components.return.reason, "too_few_students");
  assert.equal(club.get("gap")!.return, null, "dropping the missing member would have given gap the best average");
  assert.equal(club.get("gap")!.components.return.reason, "incomplete_coverage");
  assert.ok(Math.abs((club.get("full")!.return as number) - 0) < 1e-12);
  assert.deepEqual(boards.club.map((row) => [row.entrantId, row.rank]), [["full", 1], ["gap", null], ["pair", null]]);
  assert.ok(club.get("gap")!.withheld.includes("return"));
  assert.equal(boards.university.find((row) => row.entrantId === "u4")!.components.return.status, "official");
});

test("VAL-CROSS-009: a student with no club is on the individual board, on no club, and counted once at the university", () => {
  const independent = member("indy", "small-u", null, [100_000, 106_000]);
  const pending = student("pending", [100_000, 101_000], { universityId: null, clubId: "small-club" });
  const boards = computeStandings(
    [
      independent,
      independent,
      member("c1", "small-u", "small-club", [100_000, 102_000]),
      member("c2", "small-u", "small-club", [100_000, 103_000]),
      member("c3", "small-u", "small-club", [100_000, 104_000]),
      pending,
    ],
    { clubs, universities },
  );
  const individual = boards.individual.filter((row) => row.entrantId === "indy");
  assert.equal(individual.length, 1);
  assert.equal(individual[0].clubId, null);
  assert.ok(individual[0].rank !== null);
  assert.ok(boards.club.every((row) => !row.memberIds.includes("indy")));
  const university = boards.university.find((row) => row.entrantId === "small-u")!;
  assert.equal(university.memberIds.filter((id) => id === "indy").length, 1);
  assert.deepEqual([...university.memberIds].sort(), ["c1", "c2", "c3", "indy"]);
  assert.equal(university.eligibleStudents, 4);
  // An unverified student competes individually but counts toward neither group board.
  assert.ok(boards.individual.some((row) => row.entrantId === "pending"));
  assert.ok(boards.club.every((row) => !row.memberIds.includes("pending")));
  assert.ok(boards.university.every((row) => !row.memberIds.includes("pending")));
});

test("individual board ranks by window return, leaves a missing valuation unranked, and skips late entrants", () => {
  const rows = individualStandings([
    student("low", [100_000, 101_000]),
    student("high", [100_000, 104_000]),
    student("none", null),
    student("late", [100_000, 120_000], { participated: false }),
  ]);
  assert.deepEqual(rows.map((row) => [row.entrantId, row.rank]), [["high", 1], ["low", 2], ["none", null]]);
  assert.equal(rows.find((row) => row.entrantId === "none")!.return, null, "a missing valuation is unavailable, not zero");
  assert.deepEqual(officialRanks([0.1, null, 0.1, 0.05]), [1, null, 1, 3]);
});

const result = (overrides: Partial<FinalizedResult>): FinalizedResult => ({
  id: `${overrides.roundId}-${overrides.entrantId}-${overrides.edition ?? 1}`,
  seasonId: "fall-2026",
  roundId: "fall-2026-r1",
  board: "individual",
  entrantId: "ana",
  entrantName: "Ana",
  edition: 1,
  rank: 1,
  return: 0.02,
  score: 60,
  finalizedAt: "2026-09-14T04:00:00.000Z",
  ...overrides,
});

test("VAL-BOARD-006: lifetime records match the finalized rows and give nothing to a student without one", () => {
  const rows: FinalizedResult[] = [
    result({ roundId: "fall-2026-r1", entrantId: "ana", rank: 2, return: 0.02, finalizedAt: "2026-09-14T04:00:00.000Z" }),
    result({ roundId: "fall-2026-r2", entrantId: "ana", rank: 1, return: 0.04, finalizedAt: "2026-10-05T04:00:00.000Z" }),
    result({ roundId: "fall-2026-r1", entrantId: "ben", entrantName: "Ben", rank: 1, return: 0.05, finalizedAt: "2026-09-14T04:00:00.000Z" }),
    result({ roundId: "fall-2026-r2", entrantId: "ben", entrantName: "Ben", rank: 2, return: -0.01, finalizedAt: "2026-10-05T04:00:00.000Z" }),
    // A correction edition replaces Ben's round 2 figure; the original row is left as stored.
    result({ roundId: "fall-2026-r2", entrantId: "ben", entrantName: "Ben", edition: 2, rank: 2, return: 0.01, finalizedAt: "2026-10-06T04:00:00.000Z" }),
    result({ roundId: "fall-2026-r1", board: "club", entrantId: "club-1", entrantName: "Club", rank: 1, return: 0.03 }),
  ];
  const records = lifetimeRecords(rows, "individual");
  const ana = records.find((record) => record.entrantId === "ana")!;
  const ben = records.find((record) => record.entrantId === "ben")!;
  assert.deepEqual([ana.rounds, ana.wins, ana.bestRank, ana.roundIds], [2, 1, 1, ["fall-2026-r1", "fall-2026-r2"]]);
  assert.ok(Math.abs((ana.meanReturn as number) - 0.03) < 1e-12);
  assert.ok(Math.abs((ben.meanReturn as number) - 0.03) < 1e-12, "the current edition is used");
  assert.deepEqual([ana.lifetimeRank, ben.lifetimeRank], [1, 1]);
  assert.equal(records.find((record) => record.entrantId === "cy"), undefined, "no finalized rounds, no lifetime record");
  assert.equal(records.some((record) => record.entrantId === "club-1"), false, "boards are not mixed");
  assert.equal(lifetimeRecords([], "individual").length, 0, "no finalized results means no lifetime records");
  assert.equal(currentEditions(rows).length, 5);
});

const history = (overrides: Partial<BookHistory> = {}): BookHistory => ({
  registeredAt: "2026-08-24T13:00:00.000Z",
  startingCapital: "100000.00",
  executedAt: [],
  snapshots: [],
  ...overrides,
});
const snap = (valuedAt: string, equity: string | null, cash = "50000.00") => ({
  valuedAt,
  status: equity === null ? ("unavailable" as const) : ("valued" as const),
  equity,
  cash,
  holdings: equity === null ? [] : [{ sector: "Technology", value: (Number(equity) - Number(cash)).toFixed(2) }],
});

test("window path starts from the registration credit and keeps one valuation per New York session date", () => {
  const path = windowPath(
    history({
      snapshots: [
        snap("2026-08-25T15:00:00.000Z", "100500.00"),
        snap("2026-08-25T20:30:00.000Z", "101000.00"),
        snap("2026-08-26T20:30:00.000Z", "102000.00"),
      ],
    }),
    { start: null, end: "2026-09-01T00:00:00.000Z" },
  );
  assert.deepEqual(path.points?.map((point) => point.equity), [100000, 101000, 102000]);
  assert.ok(Math.abs((path.holdings?.[0].weight as number) - 52000 / 102000) < 1e-12);
  assert.ok(Math.abs((path.cashWeight as number) - 50000 / 102000) < 1e-12);
});

test("window path is unavailable when the close is unavailable or the base is stale, and a late entrant did not participate", () => {
  const closeMissing = windowPath(history({ snapshots: [snap("2026-08-25T20:30:00.000Z", "101000.00"), snap("2026-08-26T20:30:00.000Z", null)] }), {
    start: null,
    end: "2026-09-01T00:00:00.000Z",
  });
  assert.deepEqual([closeMissing.participated, closeMissing.points], [true, null]);

  const round = { start: "2026-09-14T04:00:00.000Z", end: "2026-10-05T04:00:00.000Z" };
  const stale = windowPath(history({ executedAt: ["2026-09-01T14:00:00.000Z"], snapshots: [snap("2026-09-20T20:30:00.000Z", "103000.00")] }), round);
  assert.equal(stale.points, null, "a fill after the last known valuation leaves no base for the round");

  const based = windowPath(
    history({
      executedAt: ["2026-09-01T14:00:00.000Z"],
      snapshots: [snap("2026-09-11T20:30:00.000Z", "101000.00"), snap("2026-09-20T20:30:00.000Z", "103020.00")],
    }),
    round,
  );
  assert.deepEqual(based.points?.map((point) => point.equity), [101000, 103020]);

  const late = windowPath(history({ registeredAt: "2026-09-15T14:00:00.000Z" }), round);
  assert.equal(late.participated, false);
});

test("a fill with no later in-window valuation leaves the close unavailable, withholds group coverage, and is not finalized as complete", () => {
  const round = { start: "2026-09-14T04:00:00.000Z", end: "2026-10-05T04:00:00.000Z" };
  const base = snap("2026-09-11T20:30:00.000Z", "100000.00");
  const close = snap("2026-09-20T20:30:00.000Z", "104000.00");
  // Recorded after the round end, so it cannot stand in for the close.
  const afterEnd = snap("2026-10-06T20:30:00.000Z", "90000.00");
  const filled = history({ executedAt: ["2026-09-25T14:00:00.000Z"], snapshots: [base, close, afterEnd] });

  const path = windowPath(filled, round);
  assert.deepEqual([path.participated, path.points, path.holdings, path.cashWeight], [true, null, null, null]);
  assert.ok(windowPath(history({ executedAt: ["2026-09-18T14:00:00.000Z"], snapshots: [base, close] }), round).points, "a fill before the close is covered by it");
  assert.ok(windowPath(history({ executedAt: ["2026-10-06T14:00:00.000Z"], snapshots: [base, close] }), round).points, "a fill after the window end does not affect it");

  const inputs = (lastHistory: BookHistory): SeasonInputs => ({
    season: { id: "fall-2026", name: "Fall 2026", startsAt: "2026-08-24T04:00:00.000Z", endsAt: "2026-12-18T05:00:00.000Z" },
    rounds: [],
    students: [
      { studentId: "m1", name: "M1", universityId: "u1", clubId: "c1", history: history({ snapshots: [base, close] }) },
      { studentId: "m2", name: "M2", universityId: "u1", clubId: "c1", history: history({ snapshots: [base, close] }) },
      { studentId: "m3", name: "M3", universityId: "u1", clubId: "c1", history: lastHistory },
    ],
    clubs: [{ id: "c1", name: "Club One", universityId: "u1" }],
    universities: [{ id: "u1", name: "University One" }],
  });

  // The rows finalizeRound writes for this round.
  const stale = entryPayloads(standingsFor(inputs(filled), round));
  const m3 = stale.individual.find((row) => row.entrant_id === "m3")!;
  assert.deepEqual([m3.return_pct, m3.rank, m3.score, m3.diversification, m3.score_label], [null, null, null, null, "Unavailable"]);
  for (const board of ["club", "university"] as const) {
    const [group] = stale[board];
    assert.equal(group.return_pct, null, `the ${board} return is withheld, not a two-member average`);
    assert.equal(group.rank, null);
    assert.ok(group.withheld.includes("return") && group.withheld.includes("diversification"));
  }
  const groups = standingsFor(inputs(filled), round);
  assert.deepEqual([groups.club[0].components.return.reason, groups.club[0].components.return.covered], ["incomplete_coverage", 2]);

  const complete = entryPayloads(standingsFor(inputs(history({ executedAt: ["2026-09-18T14:00:00.000Z"], snapshots: [base, close] })), round));
  assert.ok(Math.abs((complete.club[0].return_pct as number) - 0.04) < 1e-9, "with a valuation after the fill the club is complete");
  assert.equal(complete.club[0].rank, 1);
});
