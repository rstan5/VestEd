import { askResponse, professorErrorResponse, requestOwner } from "@/lib/professor/http";
import { listConversations } from "@/lib/professor/load";

export const dynamic = "force-dynamic";

/** The caller's own saved conversations. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestOwner(request);
  if (!caller) return professorErrorResponse("not_signed_in");
  const conversations = await listConversations(caller.client);
  if (!conversations) return professorErrorResponse("professor_unavailable");
  return Response.json({ conversations });
}

/** Starts a conversation with a first question. The owner is the session user. */
export async function POST(request: Request): Promise<Response> {
  return askResponse(request, null);
}
