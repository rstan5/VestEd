import { z } from "zod";
import { QUESTION_LIMIT } from "./types";

const askSchema = z.strictObject({ question: z.string() });

export type ParsedAsk =
  | { ok: true; question: string }
  | { ok: false; code: "unexpected_field"; fields: string[] }
  | { ok: false; code: "invalid_request" | "invalid_question" };

/** Accepts the question only. A student id, book, price, reply, or order field is rejected. */
export function parseAsk(body: unknown): ParsedAsk {
  const result = askSchema.safeParse(body);
  if (!result.success) {
    const unexpected = result.error.issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []));
    if (unexpected.length > 0) return { ok: false, code: "unexpected_field", fields: unexpected };
    return { ok: false, code: "invalid_request" };
  }
  const question = result.data.question.trim();
  if (question.length === 0 || question.length > QUESTION_LIMIT) return { ok: false, code: "invalid_question" };
  return { ok: true, question };
}
