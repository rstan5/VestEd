import { createMarketAdapter } from "@/lib/market/adapter";
import { loadSecurity } from "@/lib/market/views";

export const dynamic = "force-dynamic";

/** Quote, profile, history, statistics, and news for one symbol, exactly as the detail page renders them. */
export async function GET(_request: Request, { params }: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await params;
  return Response.json(await loadSecurity(createMarketAdapter(), decodeURIComponent(ticker)));
}
