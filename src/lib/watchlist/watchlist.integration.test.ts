import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { loadWatchlist } from "./load";

// Runs against the local Supabase stack when it is up and .env.local has its keys.
// Otherwise every case is reported as skipped, never as passed.
try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

type Client = SupabaseClient<Database>;
type Student = { id: string; client: Client };

const run = randomUUID().replace(/-/g, "").slice(0, 8);
const createdUsers: string[] = [];
let skipReason: string | false = false;
let admin: Client;

async function stackReason(): Promise<string | false> {
  if (!url || !anonKey || !serviceKey) return "local Supabase keys are not in .env.local";
  try {
    const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(2000) });
    return response.ok ? false : `local Supabase health returned ${response.status}`;
  } catch {
    return "local Supabase is not running";
  }
}

async function student(label: string): Promise<Student> {
  const email = `watch-${label}-${run}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `${label} ${run}` } });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUsers.push(data.user.id);
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

async function tickers(who: Student): Promise<string[]> {
  const state = await loadWatchlist(who.client);
  assert.equal(state.status, "ready");
  return state.status === "ready" ? state.tickers : [];
}

describe("watchlist against local Supabase", () => {
  let owner: Student;
  let other: Student;

  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    owner = await student("owner");
    other = await student("other");
  });

  after(async () => {
    if (skipReason) return;
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  });

  it("an add and a remove persist for the owner across fresh reads", async (t) => {
    if (skipReason) return t.skip(skipReason);
    assert.equal((await owner.client.rpc("watchlist_add", { p_instrument: "msft" })).error, null);
    assert.equal((await owner.client.rpc("watchlist_add", { p_instrument: "SPY" })).error, null);
    assert.deepEqual(await tickers(owner), ["MSFT", "SPY"]);

    const removed = await owner.client.rpc("watchlist_remove", { p_instrument: "MSFT" });
    assert.equal(removed.data, true);
    assert.deepEqual(await tickers(owner), ["SPY"]);
  });

  it("another student's list does not change and cannot be read or edited", async (t) => {
    if (skipReason) return t.skip(skipReason);
    assert.deepEqual(await tickers(other), []);
    assert.equal((await other.client.rpc("watchlist_add", { p_instrument: "NVDA" })).error, null);
    const removeOwners = await other.client.rpc("watchlist_remove", { p_instrument: "SPY" });
    assert.equal(removeOwners.data, false);
    assert.deepEqual(await tickers(other), ["NVDA"]);
    assert.deepEqual(await tickers(owner), ["SPY"]);

    const forged = await other.client.from("watchlists").insert({ student_id: owner.id, instrument_id: "AAPL" } as never);
    assert.notEqual(forged.error, null);
    assert.deepEqual(await tickers(owner), ["SPY"]);
  });

  it("unlisted symbols are rejected and nothing is stored", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const result = await owner.client.rpc("watchlist_add", { p_instrument: `ZZ${run}` });
    assert.equal(result.error?.message, "unknown_instrument");
    assert.deepEqual(await tickers(owner), ["SPY"]);
  });

  it("a signed-out caller cannot read or write watchlists", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    assert.notEqual((await anon.rpc("watchlist_add", { p_instrument: "AAPL" })).error, null);
    const read = await anon.from("watchlists").select("instrument_id");
    assert.ok(read.error !== null || (read.data ?? []).length === 0);
  });
});
