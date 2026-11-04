import { normalizeTicker } from "@/lib/market/views";
import { requestClient } from "@/lib/ledger/http";
import { watchlistErrorResponse, watchlistResponse } from "@/lib/watchlist/http";

export const dynamic = "force-dynamic";

/** Removes one symbol from the caller's own watchlist. Another student's list cannot be named. */
export async function DELETE(request: Request, { params }: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker: raw } = await params;
  const ticker = normalizeTicker(decodeURIComponent(raw));
  if (!ticker) return watchlistErrorResponse("invalid_ticker");
  const caller = await requestClient(request);
  if (!caller) return watchlistErrorResponse("not_signed_in");
  const { error } = await caller.client.rpc("watchlist_remove", { p_instrument: ticker });
  if (error) return watchlistErrorResponse(error.message);
  return watchlistResponse(caller.client);
}
