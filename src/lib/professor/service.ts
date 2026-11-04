import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerClient } from "@/lib/ledger/load";
import type { ModelAdapter } from "@/lib/model/adapter";
import type { Database, Json } from "@/lib/supabase/database";
import { loadContextPack, type ContextOwner } from "./context";
import { loadConversation } from "./load";
import type { ContextPack, Conversation } from "./types";

export type TurnWriter = SupabaseClient<Database>;

export type AskInput = {
  /** The requester's own client. Every read goes through their token. */
  client: LedgerClient;
  /** Server-only client that records the turn. The student id comes from the verified session. */
  writer: TurnWriter;
  owner: ContextOwner;
  conversationId: string | null;
  question: string;
  model: ModelAdapter;
  now?: Date;
};

export type AskResult = { ok: true; conversation: Conversation; context: ContextPack } | { ok: false; code: string };

/** What is stored next to a reply: what the Professor was given, without figures. */
export function contextRecord(pack: ContextPack): Json {
  return {
    read_at: pack.readAt,
    portfolio: pack.portfolio.status,
    holdings: pack.portfolio.status === "ready" ? pack.portfolio.holdings.map((holding) => holding.ticker) : [],
    quotes_as_of: pack.portfolio.status === "ready" ? pack.portfolio.quotesAsOf : null,
    watchlist: pack.watchlist.status === "ready" ? pack.watchlist.tickers : null,
  };
}

/**
 * One Professor turn. Reads the requester's context, asks the model adapter (which makes no
 * provider call without a key), and saves the question and reply in the same conversation.
 * Nothing here touches orders, cash, or positions.
 */
export async function askProfessor(input: AskInput): Promise<AskResult> {
  const now = input.now ?? new Date();
  if (input.conversationId) {
    const existing = await loadConversation(input.client, input.conversationId);
    if (existing.status === "not-found") return { ok: false, code: "conversation_not_found" };
    if (existing.status === "error") return { ok: false, code: "professor_unavailable" };
  }

  const context = await loadContextPack(input.client, input.owner, now);
  const reply = await input.model.reply(input.question, context);
  const { data: sessionId, error } = await input.writer.rpc("professor_record_turn", {
    p_student: input.owner.id,
    p_session: input.conversationId,
    p_question: input.question,
    p_reply_status: reply.status,
    p_reply: reply.status === "demonstration" ? reply.text : reply.reason,
    p_context: contextRecord(context),
  });
  if (error || !sessionId) return { ok: false, code: error?.message ?? "professor_unavailable" };

  const saved = await loadConversation(input.client, sessionId);
  if (saved.status !== "ready") return { ok: false, code: "professor_unavailable" };
  return { ok: true, conversation: saved.conversation, context };
}
