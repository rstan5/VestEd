export type WatchlistChange = { ok: true; tickers: string[] } | { ok: false; message: string; signedOut: boolean };

async function send(url: string, init: RequestInit): Promise<WatchlistChange> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    return { ok: false, message: "The watchlist could not be reached. Nothing changed.", signedOut: false };
  }
  let body: { tickers?: string[]; error?: { message?: string } } = {};
  try {
    body = await response.json();
  } catch {}
  if (!response.ok || !Array.isArray(body.tickers)) {
    return { ok: false, message: body.error?.message ?? "The watchlist did not change.", signedOut: response.status === 401 };
  }
  return { ok: true, tickers: body.tickers };
}

export function addToWatchlist(ticker: string): Promise<WatchlistChange> {
  return send("/api/watchlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker }),
  });
}

export function removeFromWatchlist(ticker: string): Promise<WatchlistChange> {
  return send(`/api/watchlist/${encodeURIComponent(ticker)}`, { method: "DELETE" });
}
