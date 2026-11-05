import assert from "node:assert/strict";
import { test } from "node:test";
import { currentRoundOf, pickSeason, roundCloseLabel } from "./current-round";

const season = { id: "fall-2026", name: "Fall 2026", starts_at: "2026-08-24T04:00:00+00:00", ends_at: "2026-12-07T05:00:00+00:00" };
const starts = ["2026-08-24T04:00:00+00:00", "2026-09-14T04:00:00+00:00", "2026-10-05T04:00:00+00:00", "2026-10-26T04:00:00+00:00", "2026-11-16T05:00:00+00:00"];
const ends = [...starts.slice(1), "2026-12-07T05:00:00+00:00"];
const rounds = starts.map((startsAt, index) => ({ season_id: "fall-2026", name: `Round ${index + 1}`, number: index + 1, starts_at: startsAt, ends_at: ends[index] }));

test("the live round closes on the server round's New York end date, not the sample copy", () => {
  const round = currentRoundOf(season, rounds, new Date("2026-11-04T15:00:00Z"));
  assert.equal(round?.roundName, "Round 4");
  assert.equal(round?.status, "live");
  assert.equal(roundCloseLabel(round!), "closes Nov 16");
});

test("between seasons the next round reads as opening, and an ended season has no round", () => {
  const early = currentRoundOf(season, rounds, new Date("2026-08-01T00:00:00Z"));
  assert.equal(early?.roundName, "Round 1");
  assert.equal(roundCloseLabel(early!), "opens Aug 24");
  assert.equal(currentRoundOf(season, rounds, new Date("2026-12-08T00:00:00Z")), null);
});

test("rounds of another season are ignored", () => {
  const other = rounds.map((round) => ({ ...round, season_id: "pgtap-st" }));
  assert.equal(currentRoundOf(season, other, new Date("2026-11-04T15:00:00Z")), null);
});

test("the season is the open one, else the next, else the latest", () => {
  const spring = { id: "spring-2027", name: "Spring 2027", starts_at: "2027-01-11T05:00:00+00:00", ends_at: "2027-04-26T04:00:00+00:00" };
  assert.equal(pickSeason([spring, season], new Date("2026-11-04T15:00:00Z"))?.id, "fall-2026");
  assert.equal(pickSeason([spring, season], new Date("2026-12-20T00:00:00Z"))?.id, "spring-2027");
  assert.equal(pickSeason([spring, season], new Date("2027-06-01T00:00:00Z"))?.id, "spring-2027");
  assert.equal(pickSeason([], new Date()), null);
});
