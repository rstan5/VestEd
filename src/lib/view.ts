import { DEMO_INVESTOR_ID, STARTING_CAPITAL, type Standing } from "./domain";
import { valueBook, type Book } from "./portfolio";
import { buildSnapshot } from "./scoring";
import { individualStandings, mayaSeries, securities } from "./sample-data";
import type { Ledger } from "./domain";

export function mayaView(ledger: Ledger): { book: Book; standing: Standing; seasonReturn: number } {
  const book = valueBook(ledger, securities);
  const seasonReturn = book.equity / STARTING_CAPITAL - 1;
  const base = individualStandings.find((row) => row.investorId === DEMO_INVESTOR_ID)!;
  const roundStart = mayaSeries[Math.max(0, mayaSeries.length - 8)].equity;
  const roundReturn = book.equity / roundStart - 1;
  const others = individualStandings.filter((row) => row.investorId !== DEMO_INVESTOR_ID);
  const snapshot = buildSnapshot({
    points: [...mayaSeries.slice(0, -1).map((point) => ({ equity: point.equity })), { equity: book.equity }],
    // The sample S&P path is not a licensed total-return series, so it is never scored as the benchmark.
    benchmark: null,
    holdings: book.positions.map((position) => ({ weight: position.weight, sector: position.sector })),
    cashWeight: book.equity === 0 ? 0 : book.cash / book.equity,
    rounds: [],
    field: {
      returns: others.map((row) => row.seasonReturn),
      risk: others.map((row) => row.riskAdjusted),
      drawdown: others.map((row) => row.drawdown),
      relative: [],
    },
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
      relative: null,
    },
  };
}

export function rankedStandings(maya: Standing): Standing[] {
  const rows = individualStandings.map((row) => (row.investorId === DEMO_INVESTOR_ID ? maya : row));
  return [...rows].sort((a, b) => b.seasonReturn - a.seasonReturn).map((row, index) => ({ ...row, rank: index + 1 }));
}
