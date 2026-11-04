import { ProfessorWorkspace, type RequestedConversation } from "@/components/professor/workspace";
import { StatusNote } from "@/components/ui";
import { requireAccount } from "@/lib/account/session";
import { createModelAdapter } from "@/lib/model/adapter";
import { loadContextPack } from "@/lib/professor/context";
import { listConversations, loadConversation } from "@/lib/professor/load";
import { professorWriter } from "@/lib/professor/writer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ProfessorPage({ searchParams }: { searchParams: SearchParams }) {
  const requestedId = first((await searchParams).c)?.trim() || null;
  const account = await requireAccount(requestedId ? `/professor?c=${encodeURIComponent(requestedId)}` : "/professor");
  const client = await createSupabaseServerClient();
  if (!client) {
    return <StatusNote kind="unavailable" title="The Professor is unavailable" body="The account service is not configured in this environment." />;
  }

  const [conversations, read, context] = await Promise.all([
    listConversations(client),
    requestedId ? loadConversation(client, requestedId) : Promise.resolve(null),
    loadContextPack(client, { id: account.id, displayName: account.displayName }),
  ]);
  const requested: RequestedConversation = requestedId && read && read.status !== "ready" ? { id: requestedId, status: read.status } : null;
  const conversation = read?.status === "ready" ? read.conversation : null;

  return (
    <ProfessorWorkspace
      key={conversation?.id ?? `new-${requestedId ?? ""}`}
      conversations={conversations}
      initial={conversation}
      requested={requested}
      context={context}
      model={createModelAdapter().status}
      saving={professorWriter() !== null}
    />
  );
}
