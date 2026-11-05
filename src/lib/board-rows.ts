import { DEMO_INVESTOR_ID, type ClubStanding, type ScoreComponentKey, type Standing, type UniversityStanding } from "./domain";
import type { StandingMetrics, WindowMetrics, Windowed } from "./board";
import type { StandingsPayload } from "./standings/load";
import { clubById, clubStandings, investorById, sampleRoundResults, universityById, universityStandings } from "./sample-data";

export type Board = "individual" | "club" | "university";

/** What a board row shows besides its figures. Sample and server rows share it. */
export type BoardIdentity = {
  id: string;
  name: string;
  href: string | null;
  affiliation: string;
  universityId: string;
  self: boolean;
  /** Group components the server withheld for too few students or incomplete coverage. */
  withheld?: string[];
  /** The server's score status and the components that score used. Group and sample rows carry none. */
  scoreBasis?: ScoreBasis | null;
};

export type ScoreBasis = { label: "Official" | "Partial" | "Unavailable"; included: ScoreComponentKey[] };

const SCORE_COMPONENTS: Record<ScoreComponentKey, string> = {
  return: "Return",
  risk: "Risk-adjusted",
  drawdown: "Drawdown",
  diversification: "Diversification",
  consistency: "Consistency",
  relative: "Vs S&P 500",
};

const SCORE_LABELS: ReadonlySet<string> = new Set<ScoreBasis["label"]>(["Official", "Partial", "Unavailable"]);

/** Reads the published label and included components. A row without a known label has no basis. */
export function scoreBasis(label: string | null, included: string[]): ScoreBasis | null {
  if (label === null || !SCORE_LABELS.has(label)) return null;
  const keys = (Object.keys(SCORE_COMPONENTS) as ScoreComponentKey[]).filter((key) => included.includes(key));
  return { label: label as ScoreBasis["label"], included: keys };
}

/** Display names of the components a score used, in weight order. */
export function scoreComponentNames(basis: ScoreBasis): string[] {
  return basis.included.map((key) => SCORE_COMPONENTS[key]);
}

export type BoardRow = StandingMetrics & BoardIdentity & { href: string };

type WithRounds<T> = T & Pick<StandingMetrics, "rounds">;

export type BoardSources = {
  individual: Array<WithRounds<Standing>>;
  clubs?: Array<WithRounds<ClubStanding>>;
  universities?: Array<WithRounds<UniversityStanding>>;
};

type MetricSource = Pick<Standing, "seasonReturn" | "roundReturn" | "score" | "riskAdjusted" | "drawdown" | "diversification" | "consistency" | "rank" | "previousRank"> &
  Pick<StandingMetrics, "rounds">;

export function standingMetrics(row: MetricSource): StandingMetrics {
  return {
    seasonReturn: row.seasonReturn,
    roundReturn: row.roundReturn,
    score: row.score,
    riskAdjusted: row.riskAdjusted,
    drawdown: row.drawdown,
    diversification: row.diversification,
    consistency: row.consistency,
    rank: row.rank,
    previousRank: row.previousRank,
    ...(row.rounds ? { rounds: row.rounds } : {}),
  };
}

export function buildRows(board: Board, sources: BoardSources): { rows: BoardRow[]; missing: number } {
  const rows: BoardRow[] = [];
  let missing = 0;
  if (board === "individual") {
    for (const row of sources.individual) {
      const investor = investorById(row.investorId);
      if (!investor) {
        missing += 1;
        continue;
      }
      const club = investor.clubId ? clubById(investor.clubId) : undefined;
      rows.push({
        ...standingMetrics(row),
        id: investor.id,
        name: investor.name,
        href: `/investors/${investor.id}`,
        affiliation: `${universityById(investor.universityId)?.shortName ?? "University unavailable"} · ${club ? club.shortName : "Independent"}`,
        universityId: investor.universityId,
        self: investor.id === DEMO_INVESTOR_ID,
      });
    }
  } else if (board === "club") {
    for (const row of sources.clubs ?? clubStandings) {
      const club = clubById(row.clubId);
      if (!club) {
        missing += 1;
        continue;
      }
      rows.push({
        ...standingMetrics(row),
        id: club.id,
        name: club.name,
        href: `/clubs/${club.id}`,
        affiliation: `${universityById(club.universityId)?.shortName ?? "University unavailable"} · ${row.eligibleMembers} eligible`,
        universityId: club.universityId,
        self: false,
      });
    }
  } else {
    for (const row of sources.universities ?? universityStandings) {
      const university = universityById(row.universityId);
      if (!university) {
        missing += 1;
        continue;
      }
      rows.push({
        ...standingMetrics(row),
        id: university.id,
        name: university.name,
        href: `/universities/${university.id}`,
        affiliation: `${university.conference} · ${row.eligibleInvestors} eligible`,
        universityId: university.id,
        self: false,
      });
    }
  }
  return { rows, missing };
}

/** Page sources for the sample build: the given individual standings plus sample clubs and universities, each with sample round results attached. */
export function sampleBoardSources(individual: Standing[]): BoardSources {
  return {
    individual: withSampleRounds(individual, "individual", (row) => row.investorId),
    clubs: withSampleRounds(clubStandings, "club", (row) => row.clubId),
    universities: withSampleRounds(universityStandings, "university", (row) => row.universityId),
  };
}

function withSampleRounds<T>(rows: T[], board: Board, idOf: (row: T) => string): Array<WithRounds<T>> {
  const byRound = sampleRoundResults[board];
  return rows.map((row) => {
    const id = idOf(row);
    const rounds = Object.fromEntries(Object.entries(byRound).flatMap(([roundId, results]) => (results[id] ? [[roundId, results[id]]] : [])));
    return { ...row, ...(Object.keys(rounds).length > 0 ? { rounds } : {}) };
  });
}

/** Rows for one server window, with the server's official rank. Nothing is ranked or scored here. */
export function serverWindowRows(
  payload: Pick<StandingsPayload, "windows" | "universities" | "clubs">,
  board: Board,
  windowKey: string,
  viewerId: string | null,
): Array<Windowed<BoardIdentity>> | null {
  const window = payload.windows[windowKey];
  if (!window) return null;
  const universityName = new Map(payload.universities.map((item) => [item.id, item.shortName]));
  const clubName = new Map(payload.clubs.map((item) => [item.id, item.name]));
  return window.boards[board].map((row) => {
    const university = row.universityId ? universityName.get(row.universityId) ?? null : null;
    const metrics: WindowMetrics = {
      return: row.return,
      score: row.score,
      riskAdjusted: row.riskAdjusted,
      drawdown: row.drawdown,
      diversification: row.diversification,
      consistency: row.consistency,
      rank: row.rank,
      previousRank: null,
    };
    return {
      id: row.entrantId,
      name: row.name,
      href: board === "individual" ? `/students/${row.entrantId}` : board === "club" ? `/campus/clubs/${row.entrantId}` : null,
      affiliation:
        board === "individual"
          ? `${university ?? "No verified university"} · ${row.clubId ? clubName.get(row.clubId) ?? "Club" : "Independent"}`
          : board === "club"
            ? `${university ?? "No university"} · ${row.eligibleStudents ?? 0} eligible`
            : `${row.eligibleStudents ?? 0} eligible students`,
      universityId: row.universityId ?? "",
      self: board === "individual" && row.entrantId === viewerId,
      withheld: row.withheld,
      scoreBasis: scoreBasis(row.scoreLabel, row.included),
      window: metrics,
    };
  });
}
