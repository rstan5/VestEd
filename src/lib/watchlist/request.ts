import { z } from "zod";
import { normalizeTicker } from "@/lib/market/views";

const watchRequestSchema = z.strictObject({ ticker: z.string().max(40) });

export type ParsedWatchRequest =
  | { ok: true; ticker: string }
  | { ok: false; code: "unexpected_field"; fields: string[] }
  | { ok: false; code: "invalid_request" | "invalid_ticker" };

/** Accepts a symbol only. An owner, student id, or any other field is rejected before the database is called. */
export function parseWatchRequest(body: unknown): ParsedWatchRequest {
  const result = watchRequestSchema.safeParse(body);
  if (!result.success) {
    const unexpected = result.error.issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []));
    if (unexpected.length > 0) return { ok: false, code: "unexpected_field", fields: unexpected };
    return { ok: false, code: "invalid_request" };
  }
  const ticker = normalizeTicker(result.data.ticker);
  return ticker ? { ok: true, ticker } : { ok: false, code: "invalid_ticker" };
}
