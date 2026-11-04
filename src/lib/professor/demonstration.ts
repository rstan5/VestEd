import { money, percent, plainPercent } from "@/lib/format";
import type { ContextPack } from "./types";

const closing = "This is a demonstration reply written by VestEd's rules, not a model call. It is educational, not personalized financial advice.";

function weightText(weight: string | null): string {
  return weight === null ? "an unpriced share" : plainPercent(Number(weight));
}

function bookLead(pack: ContextPack): string {
  const portfolio = pack.portfolio;
  if (portfolio.status === "not-registered") return "You have no season book open yet, so there are no holdings to discuss.";
  if (portfolio.status === "unavailable") return `Your book is not available to me right now (${portfolio.message.replace(/\.$/, "")}).`;
  const top = portfolio.holdings[0];
  if (!top) return `Your ${portfolio.seasonName} book is all cash at ${money(Number(portfolio.cash))}.`;
  return `Your largest holding is ${top.ticker} at ${weightText(top.weight)} of equity.`;
}

function concentration(pack: ContextPack): string[] {
  const portfolio = pack.portfolio;
  if (portfolio.status !== "ready") return [bookLead(pack), "Once you hold positions, I can walk through concentration and cash drag."];
  if (portfolio.holdings.length === 0) {
    return [
      bookLead(pack),
      "Nothing is concentrated yet, but a book that stays above 20% cash lowers the diversification score, and a holding under 2% of equity does not add to it.",
      "A first position you can explain in one sentence, sized so it cannot dominate the round, is a reasonable place to start. That is a method, not a recommendation.",
    ];
  }
  const sectors = [...new Set(portfolio.holdings.map((holding) => holding.sector))];
  const small = portfolio.holdings.filter((holding) => holding.weight !== null && Number(holding.weight) < 0.02).map((holding) => holding.ticker);
  return [
    bookLead(pack),
    portfolio.cashWeight === null ? "Your cash weight is unavailable because a holding has no stored quote." : `Cash is ${plainPercent(Number(portfolio.cashWeight))} of equity.`,
    `Sectors represented: ${sectors.join(", ") || "none"}.`,
    small.length ? `${small.join(", ")} ${small.length === 1 ? "is under 2% and does" : "are under 2% and do"} not add to the diversification score.` : "Holdings under 2% would not add to the diversification score, and cash above 20% lowers it.",
    "Resizing the top position before adding a token position elsewhere trades conviction against round-to-round drawdown. That is a tradeoff, not a forecast.",
  ];
}

function benchmark(pack: ContextPack): string[] {
  const portfolio = pack.portfolio;
  const own =
    portfolio.status === "ready" && portfolio.seasonReturn !== null
      ? `Your book is ${percent(Number(portfolio.seasonReturn))} against its starting capital at stored sample quotes.`
      : "Your season return is unavailable right now.";
  return [
    own,
    "The S&P 500 total-return comparison is unavailable because no licensed series is connected, so I cannot say whether you are ahead or behind it.",
    "Three weeks of returns is also too short to separate skill from a few good days.",
  ];
}

function headlines(): string[] {
  return [
    "The briefs on the Markets page are sample teaching notes written for this build. They are not a news wire.",
    "I can explain how a kind of headline could matter to a holding, but I will not treat a sample brief as news or invent a filing, a date, or a quote.",
  ];
}

function trading(pack: ContextPack): string[] {
  const holds = pack.portfolio.status === "ready" && pack.portfolio.holdings.length > 0;
  return [
    "I cannot place, stage, or cancel an order. Orders are placed only from the Portfolio trade sheet, where you review and confirm them yourself.",
    bookLead(pack),
    holds
      ? "If you are deciding whether to add or trim, write down the drawdown you would accept this round and the position weight that would break it. That is a constraint, not a price target."
      : "Before a first order, write down the drawdown you would accept this round and the largest weight you would give one position. That is a constraint, not a price target.",
  ];
}

function watchlist(pack: ContextPack): string[] {
  if (pack.watchlist.status !== "ready") return [`Your watchlist is not available to me right now (${pack.watchlist.message.replace(/\.$/, "")}).`];
  if (pack.watchlist.tickers.length === 0) return ["Your watchlist is empty. Add symbols from Markets and I can use them as context."];
  const held = pack.portfolio.status === "ready" ? new Set(pack.portfolio.holdings.map((holding) => holding.ticker)) : new Set<string>();
  const unheld = pack.watchlist.tickers.filter((ticker) => !held.has(ticker));
  return [
    `You are watching ${pack.watchlist.tickers.join(", ")}.`,
    unheld.length ? `${unheld.join(", ")} ${unheld.length === 1 ? "is" : "are"} not in your book.` : "You already hold everything you watch.",
    "Before adding one, ask which sector it would add and what weight would keep the top holding from dominating the round.",
  ];
}

function overview(pack: ContextPack): string[] {
  const portfolio = pack.portfolio;
  const holdings = portfolio.status === "ready" ? portfolio.holdings.map((holding) => holding.ticker) : [];
  return [
    bookLead(pack),
    portfolio.status === "ready" ? `Your book holds ${holdings.join(", ") || "no positions"} with ${portfolio.openOrders} open ${portfolio.openOrders === 1 ? "order" : "orders"}.` : "",
    "I can walk through concentration, cash drag, your watchlist, or how to read a sample brief. I only see your own book and the public competition rules, never another student's holdings.",
  ].filter(Boolean);
}

/** A rule-based reply from the requester's context pack. It cites no source, vendor, or data time. */
export function demonstrationReply(question: string, pack: ContextPack): string {
  const q = question.toLowerCase();
  let body: string[];
  if (/\b(trade|buy|sell|order|cancel|short)\b|should i/.test(q)) body = trading(pack);
  else if (/divers|concentrat|cash|sector|weight/.test(q)) body = concentration(pack);
  else if (/benchmark|s&p|index|outperform|underperform|beat/.test(q)) body = benchmark(pack);
  else if (/news|headline|brief/.test(q)) body = headlines();
  else if (/watch/.test(q)) body = watchlist(pack);
  else body = overview(pack);
  return [...body, closing].join(" ");
}
