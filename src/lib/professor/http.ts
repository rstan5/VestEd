import { requestClient } from "@/lib/ledger/http";
import type { LedgerClient } from "@/lib/ledger/load";
import { createModelAdapter } from "@/lib/model/adapter";
import type { ContextOwner } from "./context";
import { parseAsk } from "./request";
import { askProfessor } from "./service";
import { professorError } from "./types";
import { professorWriter } from "./writer";

export function professorErrorResponse(code: string, extra: Record<string, unknown> = {}): Response {
  const known = professorError(code);
  return Response.json({ error: { code: known.code, message: known.message, ...extra } }, { status: known.status });
}

export async function requestOwner(request: Request): Promise<{ client: LedgerClient; owner: ContextOwner } | null> {
  const caller = await requestClient(request);
  if (!caller) return null;
  const { data } = await caller.client.from("profiles").select("display_name").eq("id", caller.userId).maybeSingle();
  return { client: caller.client, owner: { id: caller.userId, displayName: data?.display_name ?? "Student" } };
}

/** Handles a question for a new conversation (null id) or a follow-up in an existing one. */
export async function askResponse(request: Request, conversationId: string | null): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return professorErrorResponse("invalid_request");
  }
  const parsed = parseAsk(body);
  if (!parsed.ok) return professorErrorResponse(parsed.code, "fields" in parsed ? { fields: parsed.fields } : {});

  const caller = await requestOwner(request);
  if (!caller) return professorErrorResponse("not_signed_in");
  const writer = professorWriter();
  if (!writer) return professorErrorResponse("professor_unavailable");

  const model = createModelAdapter();
  const result = await askProfessor({ client: caller.client, writer, owner: caller.owner, conversationId, question: parsed.question, model });
  if (!result.ok) return professorErrorResponse(result.code);
  return Response.json({ conversation: result.conversation, context: result.context, model: model.status });
}
