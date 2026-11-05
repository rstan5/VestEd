import { randomUUID } from "node:crypto";
import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

try {
  process.loadEnvFile(".env.local");
} catch {}

export const APP_URL = "http://127.0.0.1:3100";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export type Admin = SupabaseClient<Database>;
export type Student = { id: string; email: string; password: string; displayName: string };

/** Disposable fixtures share one run id so a failed run is easy to find and remove. */
export const runId = randomUUID().replace(/-/g, "").slice(0, 8);

export async function stackProblem(): Promise<string | null> {
  if (!supabaseUrl || !anonKey || !serviceKey) return "Local Supabase keys are missing from .env.local";
  try {
    const health = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(3000) });
    if (!health.ok) return `Local Supabase health returned ${health.status}`;
  } catch {
    return "Local Supabase is not running";
  }
  try {
    await fetch(APP_URL, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
  } catch {
    return `The app is not answering on ${APP_URL}`;
  }
  return null;
}

/** Server-only role for fixtures and cleanup. It never reaches the browser. */
export function admin(): Admin {
  return createClient<Database>(supabaseUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createStudent(client: Admin, label: string, created: string[]): Promise<Student> {
  const email = `e2e-${label}-${runId}@example.com`;
  const password = `pw-${randomUUID()}`;
  const displayName = `E2E ${label} ${runId}`;
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error || !data.user) throw error ?? new Error("user not created");
  created.push(data.user.id);
  return { id: data.user.id, email, password, displayName };
}

export async function userIdByEmail(client: Admin, email: string): Promise<string | null> {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function deleteUsers(client: Admin, ids: string[]) {
  for (const id of ids) {
    const { error } = await client.auth.admin.deleteUser(id);
    if (error && error.status !== 404) throw error;
  }
}

export async function signIn(page: Page, student: Student) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(student.email);
  await page.getByLabel("Password", { exact: true }).fill(student.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

/** A fresh context signed in through the real login form. */
export async function signedInPage(browser: Browser, student: Student, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL: APP_URL, viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  await signIn(page, student);
  return page;
}
