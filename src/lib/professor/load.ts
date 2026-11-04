import type { LedgerClient } from "@/lib/ledger/load";
import type { Conversation, ConversationSummary, ProfessorMessage } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The requester's own conversations, newest first, read through Row Level Security. */
export async function listConversations(client: LedgerClient): Promise<ConversationSummary[] | null> {
  const { data, error } = await client.from("ai_sessions").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(50);
  if (error) return null;
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));
}

export type ConversationRead = { status: "ready"; conversation: Conversation } | { status: "not-found" } | { status: "error" };

/** One of the requester's conversations. Another student's conversation reads as not found. */
export async function loadConversation(client: LedgerClient, id: string): Promise<ConversationRead> {
  if (!isConversationId(id)) return { status: "not-found" };
  const session = await client.from("ai_sessions").select("id, title").eq("id", id).maybeSingle();
  if (session.error) return { status: "error" };
  if (!session.data) return { status: "not-found" };
  const messages = await client.from("ai_messages").select("id, role, body, reply_status").eq("session_id", id).order("id");
  if (messages.error) return { status: "error" };
  return {
    status: "ready",
    conversation: {
      id: session.data.id,
      title: session.data.title,
      messages: (messages.data ?? []).map(
        (row): ProfessorMessage => ({ id: row.id, role: row.role, body: row.body, replyStatus: row.reply_status }),
      ),
    },
  };
}
