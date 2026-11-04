import type { Round } from "./domain";
import { METRIC_DIRECTION, compareMetric } from "./scoring";

export type BoardWindow = { kind: "season" } | { kind: "round"; round: Round };

export type BoardSortKey = "rank" | "return" | "score" | "riskAdjusted" | "diversification" | "drawdown" | "consistency";

/** One entry's stored result for a single round. Statistics not stored for the round are null or absent. */
export type RoundResult = {
  return: number;
  score?: number | null;
  riskAdjusted?: number | null;
  drawdown?: number | null;
  diversification?: number | null;
  consistency?: number | null;
};

export type StandingMetrics = {
  seasonReturn: number;
  /** The stored provisional return of the live round. */
  roundReturn: number;
  score: number | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  rank: number;
  previousRank: number;
  /** Stored results keyed by round id. */
  rounds?: Readonly<Record<string, RoundResult>>;
};

/**
 * Figures for the selected window. Rank is that window's official rank and never changes with a filter.
 * A null return or rank is unavailable or withheld on the server, not zero.
 */
export type WindowMetrics = {
  return: number | null;
  score: number | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  rank: number | null;
  previousRank: number | null;
};

export type Windowed<T> = T & { window: WindowMetrics };

function storedRoundResult(row: StandingMetrics, round: Round): RoundResult | null {
  const stored = row.rounds?.[round.id];
  if (stored) return stored;
  // Only the round return and current diversification are stored for the live round. Season-long
  // statistics are withheld rather than shown under a round label.
  if (round.status === "live") return { return: row.roundReturn, diversification: row.diversification };
  return null;
}

/**
 * Returns null when the window has no stored results, such as a finalized round this build has not
 * loaded or a round that has not started. A round window holds only entries with a stored result for
 * that round id, ranked by that round's return.
 */
export function applyWindow<T extends StandingMetrics>(rows: T[], window: BoardWindow): Array<Windowed<T>> | null {
  if (window.kind === "season") {
    return rows.map((row) => ({
      ...row,
      window: {
        return: row.seasonReturn,
        score: row.score,
        riskAdjusted: row.riskAdjusted,
        drawdown: row.drawdown,
        diversification: row.diversification,
        consistency: row.consistency,
        rank: row.rank,
        previousRank: row.previousRank,
      },
    }));
  }
  if (window.round.status === "scheduled") return null;

  const entries = rows.flatMap((row) => {
    const result = storedRoundResult(row, window.round);
    return result ? [{ row, result }] : [];
  });
  if (entries.length === 0) return null;

  const ordered = [...entries].sort((a, b) => compareMetric(a.result.return, b.result.return, METRIC_DIRECTION.return) || a.row.rank - b.row.rank);
  const rankOf = new Map(ordered.map((entry, index) => [entry, index + 1]));
  return entries.map((entry) => ({
    ...entry.row,
    window: {
      return: entry.result.return,
      score: entry.result.score ?? null,
      riskAdjusted: entry.result.riskAdjusted ?? null,
      drawdown: entry.result.drawdown ?? null,
      diversification: entry.result.diversification ?? null,
      consistency: entry.result.consistency ?? null,
      rank: rankOf.get(entry) as number,
      previousRank: null,
    },
  }));
}

export function sortBoard<T extends { window: WindowMetrics }>(rows: T[], sort: BoardSortKey): T[] {
  return [...rows].sort((a, b) => {
    if (sort !== "rank") {
      const order = compareMetric(a.window[sort], b.window[sort], METRIC_DIRECTION[sort]);
      if (order !== 0) return order;
    }
    return compareMetric(a.window.rank, b.window.rank, "lower");
  });
}
