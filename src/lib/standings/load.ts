import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentFinalizedRow, Database, LatestStandingRow } from "@/lib/supabase/database";
import type { BoardKind } from "./compute";
import { lifetimeRecords, type FinalizedResult, type LifetimeRecord } from "./lifetime";

export type StandingsReader = SupabaseClient<Database>;

export type ServerStandingRow = {
  entrantId: string;
  name: string;
  universityId: string | null;
  clubId: string | null;
  rank: number | null;
  return: number | null;
  score: number | null;
  scoreLabel: string | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  eligibleStudents: number | null;
  institutional: boolean | null;
  withheld: string[];
  included: string[];
};

export type ServerWindow = { kind: "provisional" | "final"; asOf: string; boards: Record<BoardKind, ServerStandingRow[]> };

export type ServerRoundStatus = "final" | "live" | "closing" | "scheduled";
export type ServerRound = { id: string; number: number; name: string; startsAt: string; endsAt: string; status: ServerRoundStatus; closedAt: string | null };

export type AcademicYear = { label: string; startsAt: string; endsAt: string };

export type StandingsPayload = {
  status: "ready";
  now: string;
  season: { id: string; name: string; startsAt: string; endsAt: string } | null;
  rounds: ServerRound[];
  /** Keyed by "season" or a round id. A missing key means nothing has been published for that window. */
  windows: Record<string, ServerWindow>;
  lifetime: Record<BoardKind, LifetimeRecord[]>;
  previousYear: AcademicYear & { seasons: Array<{ id: string; name: string }>; resultCount: number; records: Record<BoardKind, LifetimeRecord[]> };
  universities: Array<{ id: string; shortName: string }>;
  clubs: Array<{ id: string; name: string }>;
};

export type StandingsState = StandingsPayload | { status: "unavailable"; message: string };

const BOARDS: BoardKind[] = ["individual", "club", "university"];

/** Academic years run July 1 to June 30, so Fall 2026 belongs to 2026–27. */
export function academicYear(at: Date, offset = 0): AcademicYear {
  const first = (at.getUTCMonth() >= 6 ? at.getUTCFullYear() : at.getUTCFullYear() - 1) + offset;
  return {
    label: `${first}–${String((first + 1) % 100).padStart(2, "0")}`,
    startsAt: `${first}-07-01T00:00:00.000Z`,
    endsAt: `${first + 1}-07-01T00:00:00.000Z`,
  };
}

const num = (value: string | null) => (value === null ? null : Number(value));

function standingRow(row: LatestStandingRow | CurrentFinalizedRow): ServerStandingRow {
  return {
    entrantId: row.entrant_id,
    name: row.entrant_name,
    universityId: row.university_id,
    clubId: row.club_id,
    rank: row.rank,
    return: num(row.return_pct),
    score: num(row.score),
    scoreLabel: row.score_label,
    riskAdjusted: num(row.risk_adjusted),
    drawdown: num(row.drawdown),
    diversification: num(row.diversification),
    consistency: num(row.consistency),
    eligibleStudents: row.eligible_students,
    institutional: row.institutional,
    withheld: row.withheld ?? [],
    included: row.included ?? [],
  };
}

function finalized(row: CurrentFinalizedRow): FinalizedResult {
  return {
    id: row.id,
    seasonId: row.season_id,
    roundId: row.round_id,
    board: row.board as BoardKind,
    entrantId: row.entrant_id,
    entrantName: row.entrant_name,
    edition: row.edition,
    rank: row.rank,
    return: num(row.return_pct),
    score: num(row.score),
    finalizedAt: row.finalized_at,
  };
}

const emptyBoards = (): Record<BoardKind, ServerStandingRow[]> => ({ individual: [], club: [], university: [] });
const byRank = (a: ServerStandingRow, b: ServerStandingRow) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name);
const recordsFor = (rows: FinalizedResult[]) =>
  Object.fromEntries(BOARDS.map((board) => [board, lifetimeRecords(rows, board)])) as Record<BoardKind, LifetimeRecord[]>;

async function pages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** Public standings as the signed-in student sees them through Row Level Security. Nothing here is computed in the browser. */
export async function loadStandings(client: StandingsReader, now = new Date()): Promise<StandingsState> {
  try {
    const [seasons, universities, clubs] = await Promise.all([
      client.from("seasons").select("id, name, starts_at, ends_at").order("starts_at"),
      client.from("universities").select("id, short_name").order("short_name"),
      client.from("clubs").select("id, name").order("name"),
    ]);
    if (seasons.error || universities.error || clubs.error) return { status: "unavailable", message: "Standings did not respond." };

    const list = seasons.data ?? [];
    const at = now.getTime();
    const season =
      list.find((item) => Date.parse(item.starts_at) <= at && at < Date.parse(item.ends_at)) ??
      list.find((item) => Date.parse(item.starts_at) > at) ??
      list[list.length - 1] ??
      null;

    const results = (await pages<CurrentFinalizedRow>((from, to) => client.rpc("current_finalized_results", {}).order("id").range(from, to))).map((row) => ({
      row,
      result: finalized(row),
    }));

    const previous = academicYear(season ? new Date(season.starts_at) : now, -1);
    const previousSeasons = list.filter((item) => item.starts_at >= previous.startsAt && item.starts_at < previous.endsAt);
    const previousIds = new Set(previousSeasons.map((item) => item.id));
    const previousResults = results.filter((item) => previousIds.has(item.result.seasonId)).map((item) => item.result);

    const payload: StandingsPayload = {
      status: "ready",
      now: now.toISOString(),
      season: season ? { id: season.id, name: season.name, startsAt: season.starts_at, endsAt: season.ends_at } : null,
      rounds: [],
      windows: {},
      lifetime: recordsFor(results.map((item) => item.result)),
      previousYear: {
        ...previous,
        seasons: previousSeasons.map((item) => ({ id: item.id, name: item.name })),
        resultCount: previousResults.length,
        records: recordsFor(previousResults),
      },
      universities: (universities.data ?? []).map((item) => ({ id: item.id, shortName: item.short_name })),
      clubs: (clubs.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    };
    if (!season) return payload;

    const [rounds, latest] = await Promise.all([
      client.from("rounds").select("id, number, name, starts_at, ends_at").eq("season_id", season.id).order("number"),
      pages<LatestStandingRow>((from, to) => client.rpc("latest_standings", { p_season: season.id }).order("entrant_id").range(from, to)),
    ]);
    if (rounds.error) return { status: "unavailable", message: "Standings did not respond." };
    const roundIds = (rounds.data ?? []).map((round) => round.id);
    const closures = roundIds.length ? await client.from("round_closures").select("round_id, closed_at").in("round_id", roundIds) : { data: [], error: null };
    if (closures.error) return { status: "unavailable", message: "Standings did not respond." };
    const closedAt = new Map((closures.data ?? []).map((row) => [row.round_id, row.closed_at]));

    payload.rounds = (rounds.data ?? []).map((round) => ({
      id: round.id,
      number: round.number,
      name: round.name,
      startsAt: round.starts_at,
      endsAt: round.ends_at,
      closedAt: closedAt.get(round.id) ?? null,
      status: closedAt.has(round.id) ? "final" : at < Date.parse(round.starts_at) ? "scheduled" : at < Date.parse(round.ends_at) ? "live" : "closing",
    }));

    for (const row of latest) {
      const key = row.round_id ?? "season";
      if (row.round_id && closedAt.has(row.round_id)) continue;
      const window = (payload.windows[key] ??= { kind: "provisional", asOf: row.as_of, boards: emptyBoards() });
      window.boards[row.board as BoardKind].push(standingRow(row));
    }
    for (const { row } of results) {
      if (row.season_id !== season.id || !closedAt.has(row.round_id)) continue;
      const window = (payload.windows[row.round_id] ??= { kind: "final", asOf: closedAt.get(row.round_id)!, boards: emptyBoards() });
      window.boards[row.board as BoardKind].push(standingRow(row));
    }
    for (const round of payload.rounds) {
      if (round.status === "final") payload.windows[round.id] ??= { kind: "final", asOf: round.closedAt!, boards: emptyBoards() };
    }
    for (const window of Object.values(payload.windows)) for (const board of BOARDS) window.boards[board].sort(byRank);
    return payload;
  } catch {
    return { status: "unavailable", message: "Standings did not respond." };
  }
}
