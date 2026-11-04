import { loadWatchlist, type WatchlistClient } from "./load";
import { watchlistError } from "./types";

export function watchlistErrorResponse(code: string, extra: Record<string, unknown> = {}): Response {
  const known = watchlistError(code);
  return Response.json({ error: { code: known.code, message: known.message, ...extra } }, { status: known.status });
}

export async function watchlistResponse(client: WatchlistClient): Promise<Response> {
  const state = await loadWatchlist(client);
  if (state.status !== "ready") return watchlistErrorResponse("watchlist_unavailable");
  return Response.json({ tickers: state.tickers });
}
