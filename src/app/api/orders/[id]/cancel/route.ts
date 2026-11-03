import { errorResponse, requestClient } from "@/lib/ledger/http";
import { cancelTargetSchema } from "@/lib/ledger/request";
import type { OrderPayload } from "@/lib/ledger/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!cancelTargetSchema.safeParse(id).success) return errorResponse("order_not_found");
  const caller = await requestClient(request);
  if (!caller) return errorResponse("not_signed_in");
  const { data, error } = await caller.client.rpc("cancel_order", { p_order: id });
  if (error || !data) return errorResponse(error?.message ?? "ledger_unavailable");
  return Response.json({ order: data as unknown as OrderPayload });
}
