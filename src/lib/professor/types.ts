export type ContextHolding = {
  ticker: string;
  name: string;
  sector: string;
  quantity: string;
  weight: string | null;
};

export type PortfolioContext =
  | {
      status: "ready";
      seasonName: string;
      startingCapital: string;
      cash: string;
      equity: string | null;
      cashWeight: string | null;
      seasonReturn: string | null;
      holdings: ContextHolding[];
      openOrders: number;
      quotesAsOf: string | null;
      quoteSources: string[];
      missingQuotes: string[];
    }
  | { status: "not-registered"; message: string }
  | { status: "unavailable"; message: string };

export type WatchlistContext = { status: "ready"; tickers: string[] } | { status: "unavailable"; message: string };

export type PublicContext = {
  benchmark: "unavailable";
  rules: string[];
};

/**
 * Everything the Professor may know for one request: the requester's own book and watchlist,
 * read with their token, plus public competition rules. Nothing about another student.
 */
export type ContextPack = {
  studentId: string;
  displayName: string;
  readAt: string;
  portfolio: PortfolioContext;
  watchlist: WatchlistContext;
  public: PublicContext;
};

export const QUESTION_LIMIT = 1000;

export type ReplyStatus = "demonstration" | "unavailable";

export type ProfessorMessage = {
  id: number;
  role: "student" | "professor";
  body: string;
  replyStatus: ReplyStatus | null;
};

export type ConversationSummary = { id: string; title: string; updatedAt: string };

export type Conversation = { id: string; title: string; messages: ProfessorMessage[] };

type Known = { status: number; message: string };

const CODES: Record<string, Known> = {
  not_signed_in: { status: 401, message: "Sign in to talk with the Professor." },
  unexpected_field: { status: 400, message: "A Professor request carries only your question. The account comes from your session." },
  invalid_request: { status: 400, message: "The question was not readable." },
  invalid_question: { status: 400, message: "Write a question between 1 and 1000 characters." },
  conversation_not_found: { status: 404, message: "That conversation is not available to you." },
  conversation_full: { status: 422, message: "This conversation is full. Start a new one." },
  no_profile: { status: 409, message: "This sign-in has no student profile." },
  professor_unavailable: { status: 503, message: "Saved conversations are unavailable right now. Nothing was saved." },
};

export function professorError(code: string): Known & { code: string } {
  const known = CODES[code];
  return known ? { code, ...known } : { code: "professor_unavailable", ...CODES.professor_unavailable };
}
