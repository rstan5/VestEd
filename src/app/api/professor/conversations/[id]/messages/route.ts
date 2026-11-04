import { askResponse } from "@/lib/professor/http";

export const dynamic = "force-dynamic";

/** A follow-up question in one of the caller's conversations. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return askResponse(request, id);
}
