import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { TurnWriter } from "./service";

/**
 * The server-only client that records Professor turns. Route handlers call it only after the
 * student is taken from the session token. Returns null when the key is not configured.
 */
export function professorWriter(env: Readonly<Record<string, string | undefined>> = process.env): TurnWriter | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
