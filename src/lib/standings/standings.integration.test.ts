import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { runPostgresJobs } from "./jobs";
import { loadStandings, type StandingsPayload } from "./load";

// Runs against the local Supabase stack when it is up and .env.local has its keys; otherwise every
// case is skipped, never passed. The test uses its own 2034 season and never closes a round, so all
// of its rows can be removed afterwards. Finalized-row immutability is proven in supabase/tests.
try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

type Client = SupabaseClient<Database>;
type Student = { id: string; email: string; client: Client };

const run = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const season = `zst-${run.toLowerCase()}`;
const ticker = `ZST${run}`;
const users: string[] = [];
let clubId: string | null = null;
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
  const email = `standings-${label}-${run.toLowerCase()}@umich.edu`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `${label} ${run}` } });
  if (error || !data.user) throw error ?? new Error("user not created");
  users.push(data.user.id);
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

async function ok<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  assert.equal(error, null, error?.message);
  return data;
}

describe("server standings against local Supabase", () => {
  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  after(async () => {
    if (skipReason || !admin) return;
    await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
    if (clubId) await admin.from("clubs").delete().eq("id", clubId);
    await admin.from("seasons").delete().eq("id", season);
    await admin.from("instruments").delete().eq("id", ticker);
  });

  it("jobs value books and publish equal-weight boards that place an independent student once", async (t) => {
    if (skipReason) return t.skip(skipReason);
    await ok(admin.rpc("ledger_create_season", { p_id: season, p_name: `Standings test ${run}`, p_starts_at: "2034-01-02T05:00:00.000Z", p_rounds: 2 }));
    await ok(admin.from("instruments").insert({ id: ticker, name: `Standings test ${run}`, kind: "stock", sector: "Test" } as never));
    await ok(
      admin.from("quotes").insert([
        { instrument_id: ticker, price: "100.00", as_of: "2034-01-02T14:00:00.000Z", source: "sample" },
        { instrument_id: ticker, price: "100.00", as_of: "2034-01-02T15:20:00.000Z", source: "sample" },
        { instrument_id: ticker, price: "110.00", as_of: "2034-01-03T21:00:00.000Z", source: "sample" },
      ] as never),
    );

    const [ada, ben, cy, indy, pending] = await Promise.all(["ada", "ben", "cy", "indy", "pending"].map(student));
    const verified = [ada, ben, cy, indy];
    await ok(
      admin.from("university_affiliations").insert(
        verified.map((who) => ({ student_id: who.id, university_id: "michigan", email: who.email, status: "verified", decided_at: "2034-01-01T00:00:00.000Z" })) as never,
      ),
    );
    const club = await ok(admin.from("clubs").insert({ name: `Standings Club ${run}`, university_id: "michigan", official_status: "official" } as never).select("id").single());
    clubId = (club as unknown as { id: string }).id;
    await ok(
      admin.from("club_memberships").insert(
        [ada, ben, cy].map((who, index) => ({ club_id: clubId, student_id: who.id, role: index === 0 ? "founder" : "member", status: "active", decided_at: "2034-01-01T00:00:00.000Z" })) as never,
      ),
    );
    for (const who of [ada, ben, cy, indy, pending]) await ok(admin.rpc("ledger_register", { p_student: who.id, p_season: season, p_at: "2034-01-02T04:00:00.000Z" }));
    await ok(admin.rpc("ledger_accept_order", { p_student: ada.id, p_instrument: ticker, p_side: "buy", p_quantity: 10, p_idempotency_key: `st-${run}-1`, p_at: "2034-01-02T15:00:00.000Z" }));

    const scope = { seasonIds: [season], studentIds: [ada, ben, cy, indy, pending].map((who) => who.id) };
    const first = await runPostgresJobs(admin, new Date("2034-01-02T21:30:00.000Z"), scope);
    assert.equal(first.fill.filled.length, 1);
    assert.equal(first.valuation.snapshots.length, 5);
    assert.deepEqual(first.roundClose, { finalized: [], alreadyFinal: [] }, "no round of the test season is due");
    await runPostgresJobs(admin, new Date("2034-01-03T21:30:00.000Z"), scope);

    const state = await loadStandings(ada.client, new Date("2034-01-03T22:00:00.000Z"));
    assert.equal(state.status, "ready");
    const payload = state as StandingsPayload;
    assert.equal(payload.season?.id, season);
    assert.deepEqual(payload.rounds.map((round) => round.status), ["live", "scheduled"]);
    const window = payload.windows.season;
    assert.equal(window.kind, "provisional");
    assert.equal(Date.parse(window.asOf), Date.parse("2034-01-03T21:30:00.000Z"));

    const individual = window.boards.individual;
    assert.equal(individual.length, 5);
    const adaRow = individual.find((row) => row.entrantId === ada.id)!;
    // 100000 - 1000 - 0.10 cost + 10 x 110 = 100099.90
    assert.ok(Math.abs((adaRow.return as number) - 0.000999) < 1e-12);
    assert.equal(adaRow.rank, 1);
    assert.ok(individual.every((row) => row.rank !== null));

    const indyRows = individual.filter((row) => row.entrantId === indy.id);
    assert.equal(indyRows.length, 1, "the independent student has one individual row");
    assert.equal(indyRows[0].clubId, null);

    const clubRow = window.boards.club.find((row) => row.entrantId === clubId)!;
    assert.equal(clubRow.eligibleStudents, 3, "only the three active members count for the club");
    assert.ok(Math.abs((clubRow.return as number) - 0.000999 / 3) < 1e-10, "the club return is the equal-weight mean");

    const michigan = window.boards.university.find((row) => row.entrantId === "michigan")!;
    assert.equal(michigan.eligibleStudents, 4, "the independent counts once and the unverified student not at all");
    assert.ok(Math.abs((michigan.return as number) - 0.000999 / 4) < 1e-10);
    const live = payload.windows[`${season}-r1`];
    assert.equal(live?.kind, "provisional", "the live round has provisional standings");
    assert.equal(live.boards.individual.length, 5, "students registered before the round opened participate in it");

    const snapshots = await ok(ben.client.from("valuation_snapshots").select("student_id").eq("season_id", season));
    assert.ok((snapshots as Array<{ student_id: string }>).every((row) => row.student_id === ben.id), "students read only their own snapshots");
    const forged = await ben.client.from("standing_entries").insert({ version_id: randomUUID(), entrant_id: ben.id, entrant_name: "Ben", rank: 1 } as never);
    assert.ok(forged.error, "a student cannot write a rank");
  });
});
