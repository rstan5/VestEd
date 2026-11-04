import type { ContextPack, Conversation } from "./types";

export type AskOutcome = { ok: true; conversation: Conversation; context: ContextPack } | { ok: false; message: string; signedOut: boolean };

/** Sends a question. A null conversation starts a new one. Only the question crosses the wire. */
export async function sendQuestion(conversationId: string | null, question: string): Promise<AskOutcome> {
  const url = conversationId ? `/api/professor/conversations/${encodeURIComponent(conversationId)}/messages` : "/api/professor/conversations";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "The Professor could not be reached. Nothing was saved.", signedOut: false };
  }
  let body: { conversation?: Conversation; context?: ContextPack; error?: { message?: string } } = {};
  try {
    body = await response.json();
  } catch {}
  if (!response.ok || !body.conversation || !body.context) {
    return { ok: false, message: body.error?.message ?? "The question was not saved.", signedOut: response.status === 401 };
  }
  return { ok: true, conversation: body.conversation, context: body.context };
}
