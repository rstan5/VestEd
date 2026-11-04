import { createMarketAdapter } from "@/lib/market/adapter";
import { loadDiscovery, parseQuery, parseTypeFilter } from "@/lib/market/views";

export const dynamic = "force-dynamic";

/** Stock and ETF search, as the Markets page renders it. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const view = await loadDiscovery(createMarketAdapter(), {
    query: parseQuery(params.get("q")),
    type: parseTypeFilter(params.get("type")),
    watchlist: [],
  });
  return Response.json({ query: view.query, type: view.type, results: view.results, news: view.news });
}
