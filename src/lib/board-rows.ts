import { DEMO_INVESTOR_ID, type ClubStanding, type Standing, type UniversityStanding } from "./domain";
import type { StandingMetrics } from "./board";
import { clubById, clubStandings, investorById, universityById, universityStandings } from "./sample-data";

export type Board = "individual" | "club" | "university";

export type BoardRow = StandingMetrics & {
  id: string;
  name: string;
  href: string;
  affiliation: string;
  universityId: string;
  self: boolean;
};

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
