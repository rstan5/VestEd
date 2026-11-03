import { z } from "zod";

const KEY = /^[A-Za-z0-9_.:-]{8,100}$/;

// Shape only. The ledger function owns the trading rules, so a direct database call meets the same checks.
const orderRequestSchema = z.strictObject({
  instrument: z.string().trim().min(1).max(25),
  side: z.string().trim().min(1).max(12),
  quantity: z.number().finite(),
  idempotencyKey: z.string().regex(KEY),
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;

export type ParsedOrderRequest =
  | { ok: true; data: OrderRequest }
  | { ok: false; code: "unexpected_field"; fields: string[] }
  | { ok: false; code: "invalid_request"; fields: string[] };

/** Accepts instrument, side, quantity, and idempotency key only. A price, balance, account, or clock field is rejected. */
export function parseOrderRequest(body: unknown): ParsedOrderRequest {
  const result = orderRequestSchema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const unexpected = result.error.issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []));
  if (unexpected.length > 0) return { ok: false, code: "unexpected_field", fields: unexpected };
  const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "body")))];
  return { ok: false, code: "invalid_request", fields };
}

export const cancelTargetSchema = z.string().uuid();
