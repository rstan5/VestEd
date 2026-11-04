import { requestClient } from "@/lib/ledger/http";
import { loadStandings } from "@/lib/standings/load";

export const dynamic = "force-dynamic";

/** Server standings for the signed-in viewer. Read-only: ranks are written only by the standings jobs. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestClient(request);
  if (!caller) return Response.json({ error: { code: "not_signed_in", message: "Sign in to see server standings." } }, { status: 401 });
  const state = await loadStandings(caller.client);
  if (state.status !== "ready") return Response.json({ error: { code: "standings_unavailable", message: state.message } }, { status: 503 });
  return Response.json({ ...state, viewerId: caller.userId });
}
