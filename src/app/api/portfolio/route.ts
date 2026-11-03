import { valueLedgerBook } from "@/lib/ledger/book";
import { errorResponse, requestClient } from "@/lib/ledger/http";
import { loadLedgerBook } from "@/lib/ledger/load";

export const dynamic = "force-dynamic";

/** The caller's own book and its valuation at stored quotes. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestClient(request);
  if (!caller) return errorResponse("not_signed_in");
  const state = await loadLedgerBook(caller.client);
  if (state.status !== "ready") return errorResponse("ledger_unavailable");
  return Response.json({ book: state.book, valuation: valueLedgerBook(state.book) });
}
