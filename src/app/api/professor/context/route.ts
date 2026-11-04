import { createModelAdapter } from "@/lib/model/adapter";
import { loadContextPack } from "@/lib/professor/context";
import { professorErrorResponse, requestOwner } from "@/lib/professor/http";

export const dynamic = "force-dynamic";

/** The context pack the Professor would use for the caller right now. Reading it changes nothing. */
export async function GET(request: Request): Promise<Response> {
  const caller = await requestOwner(request);
  if (!caller) return professorErrorResponse("not_signed_in");
  const context = await loadContextPack(caller.client, caller.owner);
  return Response.json({ context, model: createModelAdapter().status });
}
