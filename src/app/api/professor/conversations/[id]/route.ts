import { professorErrorResponse, requestOwner } from "@/lib/professor/http";
import { loadConversation } from "@/lib/professor/load";

export const dynamic = "force-dynamic";

/** One of the caller's conversations. Another student's conversation is not found. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const caller = await requestOwner(request);
  if (!caller) return professorErrorResponse("not_signed_in");
  const read = await loadConversation(caller.client, id);
  if (read.status === "not-found") return professorErrorResponse("conversation_not_found");
  if (read.status === "error") return professorErrorResponse("professor_unavailable");
  return Response.json({ conversation: read.conversation });
}
