export type WatchlistState =
  | { status: "signed-out" }
  | { status: "ready"; tickers: string[] }
  | { status: "error"; message: string };

type Known = { status: number; message: string };

const CODES: Record<string, Known> = {
  not_signed_in: { status: 401, message: "Sign in to keep a watchlist." },
  unexpected_field: { status: 400, message: "A watchlist change names only a symbol. The account comes from your session." },
  invalid_request: { status: 400, message: "The watchlist request was not readable." },
  invalid_ticker: { status: 400, message: "That is not a valid stock or ETF symbol." },
  unknown_instrument: { status: 422, message: "That symbol is not in the listed universe." },
  instrument_not_allowed: { status: 422, message: "Only US stocks and ETFs can be watched." },
  watchlist_full: { status: 422, message: "Your watchlist is full. Remove a symbol before adding another." },
  no_profile: { status: 409, message: "This sign-in has no student profile." },
  watchlist_unavailable: { status: 503, message: "The watchlist did not respond. Try again." },
};

export function watchlistError(code: string): Known & { code: string } {
  const known = CODES[code];
  return known ? { code, ...known } : { code: "watchlist_unavailable", ...CODES.watchlist_unavailable };
}
