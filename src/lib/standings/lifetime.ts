import { equalWeightMean, officialRanks, type BoardKind } from "./compute";

/** One stored finalized row. Corrections are later editions; earlier editions stay as they were. */
export type FinalizedResult = {
  id: string;
  seasonId: string;
  roundId: string;
  board: BoardKind;
  entrantId: string;
  entrantName: string;
  edition: number;
  rank: number | null;
  return: number | null;
  score: number | null;
  finalizedAt: string;
};

/** The highest edition of each round, board, and entrant. */
export function currentEditions(rows: FinalizedResult[]): FinalizedResult[] {
  const latest = new Map<string, FinalizedResult>();
  for (const row of rows) {
    const key = `${row.roundId}\u0000${row.board}\u0000${row.entrantId}`;
    const held = latest.get(key);
    if (!held || row.edition > held.edition) latest.set(key, row);
  }
  return [...latest.values()];
}

export type LifetimeRecord = {
  board: BoardKind;
  entrantId: string;
  name: string;
  /** Finalized rounds with a stored row for this entrant. */
  rounds: number;
  /** Rounds where the entrant held an official rank. */
  rankedRounds: number;
  wins: number;
  bestRank: number | null;
  /** Equal-weight mean of finalized round returns. */
  meanReturn: number | null;
  lifetimeRank: number | null;
  roundIds: string[];
};

/**
 * Career records built only from finalized results. Provisional standings and sample fixtures are not
 * inputs, so an entrant with no finalized round has no record and no lifetime rank.
 */
export function lifetimeRecords(rows: FinalizedResult[], board: BoardKind): LifetimeRecord[] {
  const byEntrant = new Map<string, FinalizedResult[]>();
  for (const row of currentEditions(rows).filter((item) => item.board === board)) {
    byEntrant.set(row.entrantId, [...(byEntrant.get(row.entrantId) ?? []), row]);
  }
  const records: LifetimeRecord[] = [...byEntrant.entries()].map(([entrantId, list]) => {
    const ordered = [...list].sort((a, b) => a.finalizedAt.localeCompare(b.finalizedAt));
    const ranks = ordered.map((row) => row.rank).filter((rank): rank is number => rank !== null);
    const returns = ordered.map((row) => row.return).filter((value): value is number => value !== null);
    return {
      board,
      entrantId,
      name: ordered[ordered.length - 1].entrantName,
      rounds: ordered.length,
      rankedRounds: ranks.length,
      wins: ranks.filter((rank) => rank === 1).length,
      bestRank: ranks.length ? Math.min(...ranks) : null,
      meanReturn: returns.length ? equalWeightMean(returns) : null,
      lifetimeRank: null,
      roundIds: ordered.map((row) => row.roundId),
    };
  });
  const ranks = officialRanks(records.map((record) => record.meanReturn));
  records.forEach((record, index) => (record.lifetimeRank = ranks[index]));
  return records.sort((a, b) => (a.lifetimeRank ?? Infinity) - (b.lifetimeRank ?? Infinity) || a.name.localeCompare(b.name));
}
