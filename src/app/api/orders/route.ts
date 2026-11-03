import { errorResponse, requestClient } from "@/lib/ledger/http";
import { loadLedgerBook } from "@/lib/ledger/load";
import { parseOrderRequest } from "@/lib/ledger/request";
import type { OrderPayload } from "@/lib/ledger/types";

export const dynamic = "force-dynamic";

/** Accepts an order intent. The server sets the account, the receipt time, and the reference and fill prices. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", { fields: ["body"] });
  }
  const parsed = parseOrderRequest(body);
  if (!parsed.ok) return errorResponse(parsed.code, { fields: parsed.fields });

  const caller = await requestClient(request);
  if (!caller) return errorResponse("not_signed_in");

  const { data, error } = await caller.client.rpc("place_order", {
    p_instrument: parsed.data.instrument,
    p_side: parsed.data.side,
    p_quantity: parsed.data.quantity,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error || !data) return errorResponse(error?.message ?? "ledger_unavailable");
  const order = data as unknown as OrderPayload;
  return Response.json({ order }, { status: order.replayed ? 200 : 201 });
}

/** The caller's own orders, read through Row Level Security. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestClient(request);
  if (!caller) return errorResponse("not_signed_in");
  const state = await loadLedgerBook(caller.client);
  if (state.status !== "ready") return errorResponse("ledger_unavailable");
  return Response.json({ orders: state.book.orders });
}
