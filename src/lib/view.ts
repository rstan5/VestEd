import { DEMO_INVESTOR_ID, STARTING_CAPITAL, type Standing } from "./domain";
import { valueBook, type Book } from "./portfolio";
import { buildSnapshot } from "./scoring";
import {
  benchmarkSeries,
  individualStandings,
  mayaSeries,
  seasonMeta,
  securities,
} from "./sample-data";
import type { Ledger } from "./domain";

export function mayaView(ledger: Ledger): { book: Book; standing: Standing; seasonReturn: number } {
  const book = valueBook(ledger, securities);
  const seasonReturn = book.equity / STARTING_CAPITAL - 1;
  const base = individualStandings.find((row) => row.investorId === DEMO_INVESTOR_ID)!;
  const roundStart = mayaSeries[Math.max(0, mayaSeries.length - 8)].equity;
  const roundReturn = book.equity / roundStart - 1;
  const snapshot = buildSnapshot({
    values: [...mayaSeries.slice(0, -1).map((point) => point.equity), book.equity],
    benchmark: benchmarkSeries.map((point) => point.benchmark),
    holdings: book.positions.map((position) => ({ weight: position.weight, sector: position.sector })),
    cashWeight: book.equity === 0 ? 0 : book.cash / book.equity,
    roundExcess: [0.004, 0.006, -0.002, roundReturn - 0.004],
  });
  return {
    book,
    seasonReturn,
    standing: {
      ...base,
      seasonReturn,
      roundReturn,
      score: snapshot.score ?? base.score,
      riskAdjusted: snapshot.riskAdjusted,
      drawdown: snapshot.drawdown,
      diversification: snapshot.diversification,
      consistency: snapshot.consistency,
      relative: seasonReturn - seasonMeta.benchmarkReturn,
    },
  };
}

export function rankedStandings(maya: Standing): Standing[] {
  const rows = individualStandings.map((row) => (row.investorId === DEMO_INVESTOR_ID ? maya : row));
  return [...rows].sort((a, b) => b.seasonReturn - a.seasonReturn).map((row, index) => ({ ...row, rank: index + 1 }));
}
