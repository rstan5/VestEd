import type { Round } from "./domain";
import { METRIC_DIRECTION, compareMetric } from "./scoring";

export type BoardWindow = { kind: "season" } | { kind: "round"; round: Round };

export type BoardSortKey = "rank" | "return" | "score" | "riskAdjusted" | "diversification" | "drawdown" | "consistency";

export type StandingMetrics = {
  seasonReturn: number;
  roundReturn: number;
  score: number | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  rank: number;
  previousRank: number;
};

/** Figures for the selected window. Rank is that window's official rank and never changes with a filter. */
export type WindowMetrics = {
  return: number;
  score: number | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
  rank: number;
  previousRank: number | null;
};

export type Windowed<T> = T & { window: WindowMetrics };

/**
 * Returns null when the window has no stored results, such as a finalized round this build has not
 * loaded or a round that has not started.
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
  if (window.round.status !== "live") return null;

  // Only the round return is stored for the live round. Season-long statistics are withheld rather than
  // shown under a round label.
  const ordered = [...rows].sort((a, b) => compareMetric(a.roundReturn, b.roundReturn, METRIC_DIRECTION.return) || a.rank - b.rank);
  const rankOf = new Map<T, number>(ordered.map((row, index) => [row, index + 1]));
  return rows.map((row) => ({
    ...row,
    window: {
      return: row.roundReturn,
      score: null,
      riskAdjusted: null,
      drawdown: null,
      diversification: row.diversification,
      consistency: null,
      rank: rankOf.get(row) as number,
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
    return a.window.rank - b.window.rank;
  });
}
