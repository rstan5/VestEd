import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runLedgerFills } from "@/lib/ledger/job-store";
import { loadLedgerBook } from "@/lib/ledger/load";
import { createModelAdapter } from "@/lib/model/adapter";
import type { Database } from "@/lib/supabase/database";
import { loadContextPack } from "./context";
import { listConversations, loadConversation } from "./load";
import { askProfessor } from "./service";

// Runs against the local Supabase stack when it is up and .env.local has its keys.
// Otherwise every case is reported as skipped, never as passed. Fixture quotes are labeled sample.
try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

type Client = SupabaseClient<Database>;
type Student = { id: string; name: string; email: string; password: string; client: Client };

const run = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const createdUsers: string[] = [];
const createdInstruments: string[] = [];
const AT = "2026-11-10T16:00:00.000Z";
let skipReason: string | false = false;
let admin: Client;

// Every request that is not to the local Supabase stack would be a provider call.
const realFetch = globalThis.fetch;
const providerRequests: string[] = [];

async function stackReason(): Promise<string | false> {
  if (!url || !anonKey || !serviceKey) return "local Supabase keys are not in .env.local";
  try {
    const response = await realFetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(2000) });
    return response.ok ? false : `local Supabase health returned ${response.status}`;
  } catch {
    return "local Supabase is not running";
  }
}

async function signIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return client;
}

async function student(label: string): Promise<Student> {
  const email = `professor-${label}-${run.toLowerCase()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const name = `${label} ${run}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUsers.push(data.user.id);
  return { id: data.user.id, name, email, password, client: await signIn(email, password) };
}

async function holding(who: Student, sector: string, quantity: number, price: string): Promise<string> {
  const id = `P${run}${createdInstruments.length + 1}`;
  assert.equal((await admin.from("instruments").insert({ id, name: `Professor test ${sector}`, kind: "stock", sector } as never)).error, null);
  createdInstruments.push(id);
  for (const asOf of ["2026-11-10T14:00:00.000Z", "2026-11-10T15:20:00.000Z"]) {
    assert.equal((await admin.from("quotes").insert({ instrument_id: id, price, as_of: asOf, source: "sample" } as never)).error, null);
  }
  assert.equal((await admin.rpc("ledger_register", { p_student: who.id, p_season: null, p_at: "2026-11-10T15:00:00.000Z" })).error, null);
  const accepted = await admin.rpc("ledger_accept_order", {
    p_student: who.id,
    p_instrument: id,
    p_side: "buy",
    p_quantity: quantity,
    p_idempotency_key: `professor-${randomUUID()}`,
    p_at: "2026-11-10T15:00:00.000Z",
  });
  assert.equal(accepted.error, null);
  const filled = await runLedgerFills(admin, new Date("2026-11-10T15:30:00.000Z"), [who.id]);
  assert.equal(filled.filled.length, 1);
  return id;
}

async function book(who: Student) {
  const state = await loadLedgerBook(who.client, new Date(AT));
  assert.equal(state.status, "ready");
  if (state.status !== "ready") throw new Error("book not ready");
  const { cash, positions, orders, cashLines } = state.book;
  return { cash, positions, orders: orders.map((order) => [order.id, order.status, order.reservation?.held ?? null]), cashLines };
}

function ask(who: Student, conversationId: string | null, question: string) {
  return askProfessor({
    client: who.client,
    writer: admin,
    owner: { id: who.id, displayName: who.name },
    conversationId,
    question,
    model: createModelAdapter({}),
    now: new Date(AT),
  });
}

describe("Professor against local Supabase", () => {
  let owner: Student;
  let other: Student;
  let ownerTicker: string;
  let otherTicker: string;
  let conversationId: string;

  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    owner = await student("owner");
    other = await student("other");
    ownerTicker = await holding(owner, "Utilities", 10, "50.00");
    otherTicker = await holding(other, "Semiconductors", 37, "80.00");
    assert.equal((await owner.client.rpc("watchlist_add", { p_instrument: "SPY" })).error, null);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input instanceof Request ? input.url : input);
      if (!target.startsWith(url!)) providerRequests.push(target);
      return realFetch(input, init);
    }) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    if (skipReason || !admin) return;
    await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
    if (createdInstruments.length) await admin.from("instruments").delete().in("id", createdInstruments);
  });

  it("the context pack has the owner's server book and watchlist and none of the other student's holdings", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const pack = await loadContextPack(owner.client, { id: owner.id, displayName: owner.name }, new Date(AT));
    assert.equal(pack.studentId, owner.id);
    assert.equal(pack.portfolio.status, "ready");
    if (pack.portfolio.status !== "ready") return;
    assert.deepEqual(pack.portfolio.holdings.map((item) => [item.ticker, item.quantity]), [[ownerTicker, "10"]]);
    assert.equal(pack.portfolio.cash, "99499.90");
    assert.deepEqual(pack.portfolio.quoteSources, ["sample"]);
    assert.deepEqual(pack.watchlist, { status: "ready", tickers: ["SPY"] });
    const serialized = JSON.stringify(pack);
    for (const privateFact of [otherTicker, other.id, other.name, "Semiconductors"]) {
      assert.ok(!serialized.includes(privateFact), `${privateFact} is not in the owner's pack`);
    }
    assert.ok(!serialized.toLowerCase().includes("maya"));
    assert.deepEqual(providerRequests, [], "no provider request was made");
  });

  it("a follow-up stays in the same saved conversation and survives a fresh sign-in", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const before = await book(owner);
    const first = await ask(owner, null, "Where is my book concentrated?");
    assert.ok(first.ok, !first.ok ? first.code : undefined);
    if (!first.ok) return;
    conversationId = first.conversation.id;
    assert.equal(first.conversation.title, "Where is my book concentrated?");
    const second = await ask(owner, conversationId, "Should I buy more?");
    assert.ok(second.ok);
    if (!second.ok) return;
    assert.equal(second.conversation.id, conversationId);

    const reloaded = await loadConversation(await signIn(owner.email, owner.password), conversationId);
    assert.equal(reloaded.status, "ready");
    if (reloaded.status !== "ready") return;
    assert.deepEqual(
      reloaded.conversation.messages.map((message) => [message.role, message.replyStatus]),
      [["student", null], ["professor", "demonstration"], ["student", null], ["professor", "demonstration"]],
    );
    assert.equal(reloaded.conversation.messages[2].body, "Should I buy more?");
    assert.ok(reloaded.conversation.messages[1].body.includes(ownerTicker));
    assert.ok(!reloaded.conversation.messages.some((message) => message.body.includes(otherTicker)));
    assert.deepEqual((await listConversations(owner.client))?.map((item) => item.id), [conversationId]);

    assert.deepEqual(await book(owner), before, "asking the Professor leaves orders, cash, and positions unchanged");
    assert.deepEqual(providerRequests, [], "no provider request was made");
  });

  it("another student and a signed-out caller cannot read or write the conversation", async (t) => {
    if (skipReason) return t.skip(skipReason);
    assert.deepEqual(await loadConversation(other.client, conversationId), { status: "not-found" });
    assert.deepEqual(await listConversations(other.client), []);
    const peek = await other.client.from("ai_messages").select("body").eq("session_id", conversationId);
    assert.equal(peek.error, null);
    assert.deepEqual(peek.data, []);

    const intrude = await ask(other, conversationId, "What does the owner hold?");
    assert.deepEqual(intrude, { ok: false, code: "conversation_not_found" });
    const direct = await other.client.rpc("professor_record_turn", {
      p_student: other.id,
      p_session: conversationId,
      p_question: "hi",
      p_reply_status: "demonstration",
      p_reply: "I am a live model",
      p_context: null,
    });
    assert.notEqual(direct.error, null, "students cannot record a turn themselves");
    const forged = await other.client.from("ai_messages").insert({ session_id: conversationId, student_id: owner.id, role: "professor", body: "forged" } as never);
    assert.notEqual(forged.error, null);
    const forgedSession = await owner.client.from("ai_sessions").insert({ student_id: owner.id, title: "forged" } as never);
    assert.notEqual(forgedSession.error, null, "even the owner writes only through the server");

    const anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonRead = await anon.from("ai_messages").select("body").eq("session_id", conversationId);
    assert.ok(anonRead.error !== null || (anonRead.data ?? []).length === 0);

    const saved = await loadConversation(owner.client, conversationId);
    assert.equal(saved.status === "ready" && saved.conversation.messages.length, 4, "nothing was added by the other student");
  });

  it("a student with no season book gets a not-registered context and no book is opened", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const fresh = await student("fresh");
    const pack = await loadContextPack(fresh.client, { id: fresh.id, displayName: fresh.name }, new Date(AT));
    assert.equal(pack.portfolio.status, "not-registered");
    const turn = await ask(fresh, null, "Where is my book concentrated?");
    assert.ok(turn.ok);
    const registrations = await admin.from("registrations").select("id").eq("student_id", fresh.id);
    assert.deepEqual(registrations.data, [], "the Professor did not open a season book");
  });
});
