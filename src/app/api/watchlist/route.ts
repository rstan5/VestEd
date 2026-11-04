import { parseWatchRequest } from "@/lib/watchlist/request";
import { requestClient } from "@/lib/ledger/http";
import { watchlistErrorResponse, watchlistResponse } from "@/lib/watchlist/http";

export const dynamic = "force-dynamic";

/** The caller's own watchlist. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestClient(request);
  if (!caller) return watchlistErrorResponse("not_signed_in");
  return watchlistResponse(caller.client);
}

/** Adds one symbol to the caller's watchlist. The owner is the session user, never a request field. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return watchlistErrorResponse("invalid_request");
  }
  const parsed = parseWatchRequest(body);
  if (!parsed.ok) return watchlistErrorResponse(parsed.code, "fields" in parsed ? { fields: parsed.fields } : {});

  const caller = await requestClient(request);
  if (!caller) return watchlistErrorResponse("not_signed_in");
  const { error } = await caller.client.rpc("watchlist_add", { p_instrument: parsed.ticker });
  if (error) return watchlistErrorResponse(error.message);
  return watchlistResponse(caller.client);
}
