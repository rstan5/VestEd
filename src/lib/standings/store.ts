import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundStore, ValuationStore } from "@/lib/jobs/types";
import type { Database, Json } from "@/lib/supabase/database";
import { computeStandings, type BoardKind, type GroupStanding, type IndividualStanding, type Standings, type StudentWindowInput } from "./compute";
import { windowPath, type BookHistory } from "./window";

/** A service-role client. Standings are written only by server jobs, never from a browser. */
export type StandingsClient = SupabaseClient<Database>;

export type SeasonInfo = { id: string; name: string; startsAt: string; endsAt: string };
export type RoundInfo = { id: string; seasonId: string; number: number; name: string; startsAt: string; endsAt: string };

export type SeasonInputs = {
  season: SeasonInfo;
  rounds: RoundInfo[];
  students: Array<{ studentId: string; name: string; universityId: string | null; clubId: string | null; history: BookHistory }>;
  clubs: Array<{ id: string; name: string; universityId: string | null }>;
  universities: Array<{ id: string; name: string }>;
};

const PAGE = 1000;

async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${what} could not be read: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Everything the formula needs for one season, read with the service role. */
export async function loadSeasonInputs(client: StandingsClient, seasonId: string): Promise<SeasonInputs> {
  const [season, rounds, registrations, affiliations, memberships, clubs, universities, snapshots, executions] = await Promise.all([
    client.from("seasons").select("id, name, starts_at, ends_at").eq("id", seasonId).single(),
    client.from("rounds").select("id, season_id, number, name, starts_at, ends_at").eq("season_id", seasonId).order("number"),
    all((from, to) => client.from("registrations").select("id, student_id, starting_capital::text, registered_at").eq("season_id", seasonId).order("id").range(from, to), "Registrations"),
    all((from, to) => client.from("university_affiliations").select("student_id, university_id").eq("status", "verified").order("student_id").range(from, to), "Affiliations"),
    all((from, to) => client.from("club_memberships").select("club_id, student_id").eq("status", "active").order("student_id").range(from, to), "Memberships"),
    all((from, to) => client.from("clubs").select("id, name, university_id").order("id").range(from, to), "Clubs"),
    client.from("universities").select("id, name").order("id"),
    all(
      (from, to) =>
        client
          .from("valuation_snapshots")
          .select("registration_id, valued_at, status, equity::text, cash::text, holdings")
          .eq("season_id", seasonId)
          .order("id")
          .range(from, to),
      "Valuation snapshots",
    ),
    all((from, to) => client.from("executions").select("id, registration_id, executed_at").order("id").range(from, to), "Executions"),
  ]);
  if (season.error || !season.data) throw new Error(`Season ${seasonId} could not be read`);
  if (rounds.error) throw new Error(`Rounds could not be read: ${rounds.error.message}`);
  if (universities.error) throw new Error(`Universities could not be read: ${universities.error.message}`);

  const studentIds = registrations.map((row) => row.student_id);
  const names = new Map<string, string>();
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data, error } = await client.from("profiles").select("id, display_name").in("id", studentIds.slice(i, i + 200));
    if (error) throw new Error(`Profiles could not be read: ${error.message}`);
    for (const row of data ?? []) names.set(row.id, row.display_name);
  }
  const university = new Map(affiliations.map((row) => [row.student_id, row.university_id]));
  const club = new Map(memberships.map((row) => [row.student_id, row.club_id]));
  const snapshotsBy = groupBy(snapshots, (row) => row.registration_id);
  const executionsBy = groupBy(executions, (row) => row.registration_id);

  return {
    season: { id: season.data.id, name: season.data.name, startsAt: season.data.starts_at, endsAt: season.data.ends_at },
    rounds: (rounds.data ?? []).map((row) => ({ id: row.id, seasonId: row.season_id, number: row.number, name: row.name, startsAt: row.starts_at, endsAt: row.ends_at })),
    students: registrations.map((row) => ({
      studentId: row.student_id,
      name: names.get(row.student_id) ?? "Student",
      universityId: university.get(row.student_id) ?? null,
      clubId: club.get(row.student_id) ?? null,
      history: {
        registeredAt: row.registered_at,
        startingCapital: row.starting_capital,
        executedAt: (executionsBy.get(row.id) ?? []).map((item) => item.executed_at),
        snapshots: (snapshotsBy.get(row.id) ?? []).map((item) => ({
          valuedAt: item.valued_at,
          status: item.status,
          equity: item.equity,
          cash: item.cash,
          holdings: (item.holdings ?? []).map((holding) => ({ sector: holding.sector, value: holding.value })),
        })),
      },
    })),
    clubs: clubs.map((row) => ({ id: row.id, name: row.name, universityId: row.university_id })),
    universities: (universities.data ?? []).map((row) => ({ id: row.id, name: row.name })),
  };
}

export function windowInputs(inputs: SeasonInputs, window: { start: string | null; end: string }): StudentWindowInput[] {
  return inputs.students.map((student) => {
    const path = windowPath(student.history, window);
    return {
      id: student.studentId,
      name: student.name,
      participated: path.participated,
      universityId: student.universityId,
      clubId: student.clubId,
      points: path.points,
      holdings: path.holdings,
      cashWeight: path.cashWeight,
    };
  });
}

export function standingsFor(inputs: SeasonInputs, window: { start: string | null; end: string }): Standings {
  return computeStandings(windowInputs(inputs, window), { clubs: inputs.clubs, universities: inputs.universities });
}

/** The latest stored valuation at or before `end`, which is what a window's standings reflect. */
export function windowAsOf(inputs: SeasonInputs, end: string): string | null {
  const limit = Date.parse(end);
  let latest: number | null = null;
  for (const student of inputs.students) {
    for (const snapshot of student.history.snapshots) {
      const at = Date.parse(snapshot.valuedAt);
      if (at <= limit && (latest === null || at > latest)) latest = at;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

type EntryPayload = {
  entrant_id: string;
  entrant_name: string;
  university_id: string | null;
  club_id: string | null;
  rank: number | null;
  return_pct: number | null;
  score: number | null;
  score_label: string | null;
  risk_adjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  eligible_students: number | null;
  institutional: boolean | null;
  withheld: string[];
  included: string[];
};

const figures = (row: IndividualStanding | GroupStanding) => ({
  rank: row.rank,
  return_pct: row.return,
  score: row.score,
  risk_adjusted: row.riskAdjusted,
  drawdown: row.drawdown,
  diversification: row.diversification,
  consistency: row.consistency,
});

export function entryPayloads(standings: Standings): Record<BoardKind, EntryPayload[]> {
  return {
    individual: standings.individual.map((row) => ({
      entrant_id: row.entrantId,
      entrant_name: row.name,
      university_id: row.universityId,
      club_id: row.clubId,
      ...figures(row),
      score_label: row.scoreLabel,
      eligible_students: null,
      institutional: row.institutional,
      withheld: [],
      included: row.included,
    })),
    club: standings.club.map((row) => group(row, "club")),
    university: standings.university.map((row) => group(row, "university")),
  };
}

function group(row: GroupStanding, board: "club" | "university"): EntryPayload {
  return {
    entrant_id: row.entrantId,
    entrant_name: row.name,
    university_id: row.universityId,
    club_id: board === "club" ? row.entrantId : null,
    ...figures(row),
    score_label: null,
    eligible_students: row.eligibleStudents,
    institutional: null,
    withheld: row.withheld,
    included: [],
  };
}

const BOARDS: BoardKind[] = ["individual", "club", "university"];

/** Seasons open at `now`, so valuations and provisional standings cover only books that can still change. */
export async function openSeasons(client: StandingsClient, now: Date, seasonIds?: string[]): Promise<string[]> {
  const iso = now.toISOString();
  let query = client.from("seasons").select("id").lte("starts_at", iso).gt("ends_at", iso).order("starts_at");
  if (seasonIds) query = query.in("id", seasonIds);
  const { data, error } = await query;
  if (error) throw new Error(`Seasons could not be read: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

export type PublishResult = { seasonId: string; windows: Array<{ roundId: string | null; asOf: string }> };

/** Writes provisional standings for the season window and every started round that is not final. */
export async function publishProvisional(client: StandingsClient, seasonId: string, now: Date): Promise<PublishResult> {
  const inputs = await loadSeasonInputs(client, seasonId);
  const { data: closures, error } = await client.from("round_closures").select("round_id").in("round_id", inputs.rounds.map((round) => round.id));
  if (error) throw new Error(`Round closures could not be read: ${error.message}`);
  const closed = new Set((closures ?? []).map((row) => row.round_id));
  const end = (limit: string) => new Date(Math.min(now.getTime(), Date.parse(limit))).toISOString();

  const windows: Array<{ roundId: string | null; start: string | null; end: string }> = [{ roundId: null, start: null, end: end(inputs.season.endsAt) }];
  for (const round of inputs.rounds) {
    if (Date.parse(round.startsAt) <= now.getTime() && !closed.has(round.id)) windows.push({ roundId: round.id, start: round.startsAt, end: end(round.endsAt) });
  }

  const published: PublishResult["windows"] = [];
  for (const window of windows) {
    const asOf = windowAsOf(inputs, window.end);
    if (!asOf) continue;
    const payloads = entryPayloads(standingsFor(inputs, window));
    for (const board of BOARDS) {
      const result = await client.rpc("standings_publish", {
        p_season: seasonId,
        p_round: window.roundId,
        p_board: board,
        p_as_of: asOf,
        p_entries: payloads[board] as unknown as Json,
      });
      if (result.error) throw new Error(`Standings could not be published: ${result.error.message}`);
    }
    published.push({ roundId: window.roundId, asOf });
  }
  return { seasonId, windows: published };
}

/** ValuationStore over the Postgres ledger. Each snapshot is keyed to a season registration. */
export function createStandingsValuationStore(client: StandingsClient, options: { now: () => Date; seasonIds?: string[] }): ValuationStore {
  return {
    async accountsToValue() {
      const now = options.now();
      const seasons = await openSeasons(client, now, options.seasonIds);
      if (seasons.length === 0) return [];
      const registrations = await all(
        (from, to) =>
          client
            .from("registrations")
            .select("id, cash::text")
            .in("season_id", seasons)
            .lte("registered_at", now.toISOString())
            .order("id")
            .range(from, to),
        "Registrations",
      );
      const ids = new Set(registrations.map((row) => row.id));
      const positions = await all(
        (from, to) => client.from("positions").select("registration_id, instrument_id, quantity::text").order("registration_id").order("instrument_id").range(from, to),
        "Positions",
      );
      const held = groupBy(positions.filter((row) => ids.has(row.registration_id)), (row) => row.registration_id);
      return registrations.map((row) => ({
        accountId: row.id,
        cash: row.cash,
        positions: (held.get(row.id) ?? []).map((item) => ({ instrumentId: item.instrument_id, quantity: item.quantity })),
      }));
    },

    async latestQuoteAtOrBefore(instrumentId, at) {
      const { data, error } = await client
        .from("quotes")
        .select("id, instrument_id, price::text, as_of")
        .eq("instrument_id", instrumentId)
        .lte("as_of", at.toISOString())
        .order("as_of", { ascending: false })
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Quotes could not be read: ${error.message}`);
      return data ? { id: data.id, instrumentId: data.instrument_id, price: data.price, asOf: data.as_of } : null;
    },

    async writeValuation(snapshot) {
      const { error } = await client.rpc("standings_record_valuation", {
        p_registration: snapshot.accountId,
        p_valued_at: snapshot.valuedAt,
        p_status: snapshot.status,
        p_equity: snapshot.equity,
        p_missing: snapshot.missing,
      });
      if (error) throw new Error(`Valuation could not be recorded: ${error.message}`);
    },
  };
}

/** RoundStore that writes all three boards of a round as finalized results, once, at the round close. */
export function createStandingsRoundStore(client: StandingsClient, options: { seasonIds?: string[] } = {}): RoundStore {
  return {
    async roundsDueForClose(at) {
      let due = client.from("rounds").select("id, ends_at").lte("ends_at", at.toISOString()).order("ends_at");
      if (options.seasonIds) due = due.in("season_id", options.seasonIds);
      const [{ data: rounds, error }, { data: closures, error: closureError }] = await Promise.all([
        due,
        client.from("round_closures").select("round_id"),
      ]);
      if (error || closureError) throw new Error(`Rounds could not be read: ${(error ?? closureError)!.message}`);
      const closed = new Set((closures ?? []).map((row) => row.round_id));
      return (rounds ?? []).filter((round) => !closed.has(round.id)).map((round) => ({ id: round.id, endsAt: round.ends_at }));
    },

    async finalizeRound(roundId, closedAt) {
      const { data: round, error } = await client.from("rounds").select("id, season_id, starts_at, ends_at").eq("id", roundId).single();
      if (error || !round) throw new Error(`Round ${roundId} could not be read`);
      const inputs = await loadSeasonInputs(client, round.season_id);
      const payloads = entryPayloads(standingsFor(inputs, { start: round.starts_at, end: round.ends_at }));
      const results = BOARDS.flatMap((board) => payloads[board].map((entry) => ({ board, ...entry })));
      const outcome = await client.rpc("standings_finalize_round", {
        p_round: roundId,
        p_closed_at: closedAt.toISOString(),
        p_results: results as unknown as Json,
      });
      if (outcome.error) throw new Error(`Round ${roundId} could not be finalized: ${outcome.error.message}`);
      return outcome.data === "finalized" ? "finalized" : "already-final";
    },
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}
