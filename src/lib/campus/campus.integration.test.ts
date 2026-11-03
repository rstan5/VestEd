import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

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

const run = randomUUID().slice(0, 8);
const created: string[] = [];
let skipReason: string | false = false;
let admin: Client;
let founder: Student;
let moderator: Student;
let approved: Student;
let rejected: Student;
let outsider: Student;
let clubId = "";

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
  const email = `campus-${label}-${run}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `${label} ${run}` } });
  if (error || !data.user) throw error ?? new Error("user not created");
  created.push(data.user.id);
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

async function rpcError(promise: PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  const { error } = await promise;
  return error?.message ?? null;
}

async function roles(): Promise<Record<string, string>> {
  const { data, error } = await founder.client.rpc("club_roster", { p_club: clubId });
  assert.equal(error, null);
  return Object.fromEntries((data ?? []).map((row) => [row.student_id, row.role]));
}

describe("campus against local Supabase", () => {
  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    [founder, moderator, approved, rejected, outsider] = await Promise.all(["founder", "moderator", "approved", "rejected", "outsider"].map(student));
  });

  after(async () => {
    if (skipReason || !admin) return;
    if (clubId) await admin.from("clubs").delete().eq("id", clubId);
    await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("a matching university domain creates a pending affiliation and does not verify", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const { data, error } = await approved.client.rpc("request_university_affiliation", { p_email: `ada-${run}@umich.edu` }).single();
    assert.equal(error, null);
    assert.equal(data?.status, "pending");
    assert.equal(data?.university_id, "michigan");
    const mine = await approved.client.rpc("my_university_affiliation").single();
    assert.equal(mine.data?.status, "pending");
    assert.notEqual(mine.data?.status, "verified");
  });

  it("only a separate review verifies, and verified stays distinct from pending", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const mine = await approved.client.rpc("my_university_affiliation").single();
    const affiliationId = mine.data!.id;
    assert.equal(await rpcError(approved.client.rpc("decide_university_affiliation", { p_affiliation: affiliationId, p_decision: "verified" })), "admin_only");
    assert.equal((await approved.client.rpc("my_university_affiliation").single()).data?.status, "pending");

    const decided = await admin.rpc("decide_university_affiliation", { p_affiliation: affiliationId, p_decision: "verified" });
    assert.equal(decided.data, "verified");
    const again = await approved.client.rpc("request_university_affiliation", { p_email: `ada-${run}@umich.edu` }).single();
    assert.equal(again.data?.status, "verified", "resubmitting does not reset a verified affiliation");

    const other = await rejected.client.rpc("request_university_affiliation", { p_email: `ben-${run}@cs.berkeley.edu` }).single();
    assert.equal(other.data?.status, "pending");
    assert.equal(other.data?.university_id, "berkeley");
    assert.equal(await rpcError(rejected.client.rpc("request_university_affiliation", { p_email: `ben-${run}@gmail.com` })), "unknown_university_domain");
  });

  it("a founder creates a club and approves one applicant and rejects another", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const createdClub = await founder.client.rpc("create_club", { p_name: `Integration Fund ${run}`, p_thesis: "Test club", p_university: "michigan" });
    assert.equal(createdClub.error, null);
    clubId = createdClub.data!;
    const listing = await outsider.client.rpc("club_directory", { p_club: clubId }).single();
    assert.equal(listing.data?.official_status, "pending_review");
    assert.equal(listing.data?.is_official, false);

    for (const applicant of [moderator, approved, rejected]) {
      assert.equal((await applicant.client.rpc("apply_to_club", { p_club: clubId })).data, "pending");
    }
    assert.equal(await rpcError(outsider.client.rpc("decide_club_application", { p_club: clubId, p_student: approved.id, p_decision: "approve" })), "not_club_leader");
    assert.equal(await rpcError(approved.client.rpc("decide_club_application", { p_club: clubId, p_student: approved.id, p_decision: "approve" })), "not_club_leader");

    assert.equal((await founder.client.rpc("decide_club_application", { p_club: clubId, p_student: moderator.id, p_decision: "approve" })).data, "active");
    assert.equal((await founder.client.rpc("decide_club_application", { p_club: clubId, p_student: approved.id, p_decision: "approve" })).data, "active");
    assert.equal((await founder.client.rpc("decide_club_application", { p_club: clubId, p_student: rejected.id, p_decision: "reject" })).data, "rejected");

    assert.equal((await approved.client.rpc("my_club_memberships").single()).data?.status, "active");
    assert.equal((await rejected.client.rpc("my_club_memberships").single()).data?.status, "rejected");
    const roster = await roles();
    assert.equal(roster[approved.id], "member");
    assert.equal(roster[rejected.id], undefined);
  });

  it("a founder assigns a moderator who cannot promote themselves or take leadership", async (t) => {
    if (skipReason) return t.skip(skipReason);
    assert.equal((await roles())[moderator.id], "member");
    assert.equal((await founder.client.rpc("set_club_member_role", { p_club: clubId, p_student: moderator.id, p_role: "moderator" })).data, "moderator");
    assert.equal((await roles())[moderator.id], "moderator");

    assert.equal(await rpcError(moderator.client.rpc("set_club_member_role", { p_club: clubId, p_student: moderator.id, p_role: "founder" })), "cannot_change_own_role");
    assert.equal(await rpcError(moderator.client.rpc("transfer_club_leadership", { p_club: clubId, p_student: moderator.id })), "founder_only");
    assert.equal(await rpcError(moderator.client.rpc("set_club_member_role", { p_club: clubId, p_student: approved.id, p_role: "moderator" })), "founder_only");
    assert.equal(await rpcError(approved.client.rpc("remove_club_member", { p_club: clubId, p_student: moderator.id })), "not_club_leader");

    const after = await roles();
    assert.equal(after[founder.id], "founder");
    assert.equal(after[moderator.id], "moderator");
    assert.equal(after[approved.id], "member");
  });

  it("a disputed club waits for admin review and a non-admin cannot close it", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const filed = await outsider.client.rpc("file_club_dispute", { p_club: clubId, p_reason: "This club copies the name of an existing society." });
    assert.equal(filed.error, null);
    const disputeId = filed.data!;

    assert.equal(await rpcError(founder.client.rpc("resolve_club_dispute", { p_dispute: disputeId, p_outcome: "dismissed" })), "admin_only");
    assert.equal(await rpcError(moderator.client.rpc("resolve_club_dispute", { p_dispute: disputeId, p_outcome: "dismissed" })), "admin_only");
    assert.equal(await rpcError(founder.client.rpc("transfer_club_leadership", { p_club: clubId, p_student: moderator.id })), "club_under_review");
    assert.equal(await rpcError(founder.client.rpc("review_club", { p_club: clubId, p_decision: "official" })), "admin_only");
    assert.equal((await founder.client.rpc("remove_club_member", { p_club: clubId, p_student: approved.id })).data, "removed");

    const queue = await admin.rpc("admin_review_queue");
    assert.ok(queue.data?.some((item) => item.kind === "club_dispute" && item.item_id === disputeId), "dispute is in the admin queue");
    const listing = await outsider.client.rpc("club_directory", { p_club: clubId }).single();
    assert.equal(listing.data?.under_dispute, true);
    assert.equal(listing.data?.is_official, false);
    assert.equal(await rpcError(admin.rpc("review_club", { p_club: clubId, p_decision: "official" })), "club_under_review");

    assert.equal((await admin.rpc("resolve_club_dispute", { p_dispute: disputeId, p_outcome: "dismissed" })).data, "dismissed");
    assert.equal((await admin.rpc("review_club", { p_club: clubId, p_decision: "official" })).data, "official");
    const approvedListing = await outsider.client.rpc("club_directory", { p_club: clubId }).single();
    assert.equal(approvedListing.data?.is_official, true);
  });
});
