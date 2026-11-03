import { SAMPLE_AS_OF } from "./domain";
import { percent, plainPercent } from "./format";
import type { Book } from "./portfolio";
import { seasonMeta } from "./sample-data";

export type ProfessorContext = {
  name: string;
  equity: number;
  cashWeight: number;
  seasonReturn: number;
  relative: number;
  largest?: { ticker: string; weight: number; sector: string };
  sectors: string[];
  holdings: string[];
};

export function professorReply(question: string, context: ProfessorContext): string {
  const q = question.toLowerCase();
  const stamp = `Sample book valued ${SAMPLE_AS_OF.slice(0, 16).replace("T", " ")} UTC. Demonstration reply, not a model call.`;
  const lead = context.largest
    ? `${context.name}'s largest holding is ${context.largest.ticker} at ${plainPercent(context.largest.weight)} of equity.`
    : `${context.name} has no open holdings in the current sample book.`;

  if (q.includes("divers") || q.includes("concentrat")) {
    return [
      lead,
      `Cash is ${plainPercent(context.cashWeight)}. Holdings under 2% do not improve the official diversification score, and cash above 20% reduces it.`,
      `Sectors currently represented: ${context.sectors.join(", ") || "none"}.`,
      "An educational adjustment would be to resize the top holding before adding a token position in a new ticker. That is a tradeoff between conviction and round-to-round drawdown, not a forecast.",
      stamp,
    ].join(" ");
  }

  if (q.includes("benchmark") || q.includes("s&p") || q.includes("underperform") || q.includes("outperform")) {
    const versus = context.relative >= 0 ? "ahead of" : "behind";
    return [
      `Season sample return is ${percent(context.seasonReturn)}, ${versus} the sample S&P path by ${percent(Math.abs(context.relative))}.`,
      `The benchmark in this build is a frozen path, last labeled ${percent(seasonMeta.benchmarkReturn)} from season start. It is not a live index level.`,
      "Outperformance here can come from sector mix or from a few days in the sample path. Three weeks is not enough to call that skill.",
      stamp,
    ].join(" ");
  }

  if (q.includes("news") || q.includes("headline")) {
    return [
      "The research desk in this prototype publishes sample briefs tied to holdings and the watchlist. They are labeled Sample Desk or Campus Markets Review and link to example.com.",
      "I can explain how a headline would matter to a holding. I cannot treat those briefs as live news, and I will not invent a filing, a date, or a quote.",
      stamp,
    ].join(" ");
  }

  if (q.includes("trade") || q.includes("buy") || q.includes("sell") || q.includes("should i")) {
    return [
      "I will not place or stage an order. The ticket on Portfolio and Markets is the only way to submit a simulated order, and you confirm it there.",
      lead,
      "If you are deciding whether to trim, write down the round drawdown you are willing to accept and the position weight that violates it. That is a constraint, not a price target.",
      "This is educational decision support, not personalized financial advice, and it is not a claim about future returns.",
      stamp,
    ].join(" ");
  }

  return [
    lead,
    `The sample book holds ${context.holdings.join(", ") || "no positions"} and is ${percent(context.seasonReturn)} on the season.`,
    "I can walk through concentration, the sample benchmark gap, or how a headline should be read. I do not have another student's private holdings, and I do not have a live quote.",
    stamp,
  ].join(" ");
}

export function contextFromBook(name: string, book: Book, seasonReturn: number, benchmarkReturn: number): ProfessorContext {
  const largest = book.positions[0];
  return {
    name,
    equity: book.equity,
    cashWeight: book.equity === 0 ? 0 : book.cash / book.equity,
    seasonReturn,
    relative: seasonReturn - benchmarkReturn,
    largest: largest ? { ticker: largest.ticker, weight: largest.weight, sector: largest.sector } : undefined,
    sectors: [...new Set(book.positions.map((position) => position.sector))],
    holdings: book.positions.map((position) => position.ticker),
  };
}
