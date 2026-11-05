import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// Shared setup for the cross-feature integration suites. They run only against the local Supabase
// stack with keys in .env.local; otherwise every case is skipped, never passed.
try {
  process.loadEnvFile(".env.local");
} catch {}

export const stackUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export type Client = SupabaseClient<Database>;
export type Student = { id: string; email: string; client: Client };

export async function stackReason(): Promise<string | false> {
  if (!stackUrl || !anonKey || !serviceKey) return "local Supabase keys are not in .env.local";
  try {
    const response = await fetch(`${stackUrl}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(2000) });
    return response.ok ? false : `local Supabase health returned ${response.status}`;
  } catch {
    return "local Supabase is not running";
  }
}

/** A service-role client. `fetch` lets a test observe every request the server jobs make. */
export function serviceClient(fetchImpl?: typeof fetch): Client {
  return createClient<Database>(stackUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

/** A disposable confirmed student, signed in with the anon key like a browser session. */
export async function createStudent(admin: Client, label: string, emailDomain: string, created: string[]): Promise<Student> {
  const email = `${label}@${emailDomain}`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: label } });
  if (error || !data.user) throw error ?? new Error("user not created");
  created.push(data.user.id);
  const client = createClient<Database>(stackUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}
