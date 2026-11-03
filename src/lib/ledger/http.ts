import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { supabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ledgerError } from "./errors";
import type { LedgerClient } from "./load";

/**
 * The caller's own Supabase client: a bearer token if one is sent, otherwise the session cookie.
 * The student is whoever the token belongs to. No request field can name a different account.
 */
export async function requestClient(request: Request): Promise<{ client: LedgerClient; userId: string } | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const header = request.headers.get("authorization");
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const client: LedgerClient | null = token
    ? createClient<Database>(env.url, env.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
    : await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = token ? await client.auth.getUser(token) : await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

export function errorResponse(code: string, extra: Record<string, unknown> = {}): Response {
  const known = ledgerError(code);
  return Response.json({ error: { code: known.code, message: known.message, ...extra } }, { status: known.status });
}
