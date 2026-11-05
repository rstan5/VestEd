import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { serverWindowRows } from "@/lib/board-rows";
import type { ValuationStore } from "@/lib/jobs/types";
import { valueAccounts } from "@/lib/jobs/valuation";
import { loadLedgerBook } from "@/lib/ledger/load";
import { ledgerSessionClock } from "@/lib/ledger/job-store";
import type { LedgerBook, OrderPayload } from "@/lib/ledger/types";
import { createMarketAdapter } from "@/lib/market/adapter";
import { runPostgresJobs } from "@/lib/standings/jobs";
import { loadStandings, type StandingsPayload } from "@/lib/standings/load";
import { createStandingsValuationStore, publishProvisional } from "@/lib/standings/store";
import { createStudent, serviceClient, stackReason, stackUrl, type Client, type Student } from "./test-stack";

// One disposable 2034 season, so no shared season, round, or finalized history is touched. Its
// rounds never come due during the test, and every row it creates is removed afterwards.
const run = randomUUID().replace(/-/g, "").slice(0, 8).toLowerCase();
const season = `zcr-${run}`;
const sampleTicker = `ZCR${run.toUpperCase()}`;
const dataless = `ZCU${run.toUpperCase()}`;
const users: string[] = [];
const requests: string[] = [];
let skipReason: string | false = false;
let admin: Client;
let owner: Student;
let other: Student;
let waiter: Student;
let ownerOrder: OrderPayload;
let waiterOrder: OrderPayload;
let ownerBefore: ReturnType<typeof privateBook>;
let otherBefore: ReturnType<typeof privateBook>;

const T = {
  registered: "2034-01-02T13:00:00.000Z",
  reference: "2034-01-02T14:00:00.000Z",
  accepted: "2034-01-02T15:00:00.000Z",
  sampleFill: "2034-01-02T15:20:00.000Z",
  firstPass: "2034-01-02T16:00:00.000Z",
  sampleClose: "2034-01-02T20:00:00.000Z",
  closePass: "2034-01-02T21:30:00.000Z",
  viewed: "2034-01-02T22:00:00.000Z",
  unavailablePass: "2034-01-03T21:30:00.000Z",
};

const recordingFetch: typeof fetch = (input, init) => {
  requests.push(new URL(input instanceof Request ? input.url : String(input)).origin);
  return fetch(input, init);
};

async function ok<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  assert.equal(error, null, error?.message);
  return data;
}

async function book(who: Student, at: string): Promise<LedgerBook> {
  const state = await loadLedgerBook(who.client, new Date(at));
  assert.equal(state.status, "ready", state.status === "unavailable" ? state.message : undefined);
  return (state as { book: LedgerBook }).book;
}

/** The private parts of a book. Shared quotes and the instrument list are public and excluded. */
function privateBook(current: LedgerBook) {
  return {
    registrationId: current.registrationId,
    studentId: current.studentId,
    cash: current.cash,
    positions: current.positions,
    orders: current.orders,
    cashLines: current.cashLines,
  };
}

/** What another student can pull from the owner's private tables directly. */
async function foreignRows(reader: Student, ownerId: string) {
  const rows: Record<string, unknown[]> = {};
  for (const table of ["registrations", "orders", "order_reservations", "executions", "cash_ledger", "positions", "valuation_snapshots"] as const) {
    const { data, error } = await reader.client.from(table).select("*").eq("student_id", ownerId);
    assert.equal(error, null, `${table}: ${error?.message}`);
    rows[table] = data ?? [];
  }
  return rows;
}

const noForeignRows = { registrations: [], orders: [], order_reservations: [], executions: [], cash_ledger: [], positions: [], valuation_snapshots: [] };

/** Runs the scheduler pass while refusing any request that leaves the local stack. */
async function jobPass(at: string) {
  const local = new URL(stackUrl!).origin;
  const realFetch = globalThis.fetch;
  const offStack: string[] = [];
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const origin = new URL(input instanceof Request ? input.url : String(input)).origin;
    if (origin !== local) {
      offStack.push(origin);
      return Promise.reject(new Error(`no vendor request is allowed: ${origin}`));
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    requests.length = 0;
    const result = await runPostgresJobs(admin, new Date(at), { seasonIds: [season], studentIds: [owner.id, other.id, waiter.id] });
    assert.ok(requests.length > 0, "the job read and wrote through the stack");
    assert.deepEqual([...new Set(requests)], [local], "every job request went to the local Supabase stack");
    assert.deepEqual(offStack, [], "no request left the local stack");
    return result;
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("cross-feature book and rank integrity against local Supabase", () => {
  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = serviceClient(recordingFetch);
    [owner, other, waiter] = await Promise.all(
      ["owner", "other", "waiter"].map((label) => createStudent(admin, `cross-${label}-${run}`, "umich.edu", users)),
    );
    await ok(admin.rpc("ledger_create_season", { p_id: season, p_name: `Cross test ${run}`, p_starts_at: "2034-01-02T05:00:00.000Z", p_rounds: 2 }));
    await ok(
      admin.from("instruments").insert([
        { id: sampleTicker, name: `Cross sample ${run}`, kind: "stock", sector: "Test" },
        { id: dataless, name: `Cross no data ${run}`, kind: "stock", sector: "Test" },
      ] as never),
    );
    // Labeled sample quotes. The dataless instrument has only the prior close a buy reserves against.
    await ok(
      admin.from("quotes").insert([
        { instrument_id: sampleTicker, price: "100.00", as_of: T.reference, source: "sample" },
        { instrument_id: dataless, price: "50.00", as_of: "2033-12-30T21:00:00.000Z", source: "sample" },
      ] as never),
    );
    await ok(
      admin.from("university_affiliations").insert(
        [owner, other, waiter].map((who) => ({ student_id: who.id, university_id: "michigan", email: who.email, status: "verified", decided_at: T.registered })) as never,
      ),
    );
    for (const who of [owner, other, waiter]) await ok(admin.rpc("ledger_register", { p_student: who.id, p_season: season, p_at: T.registered }));
  });

  after(async () => {
    if (skipReason || !admin) return;
    await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
    await admin.from("seasons").delete().eq("id", season);
    await admin.from("instruments").delete().in("id", [sampleTicker, dataless]);
  });

  it("a scheduler fill from a labeled sample quote changes only the owner's book", async (t) => {
    if (skipReason) return t.skip(skipReason);
    ownerOrder = (await ok(
      admin.rpc("ledger_accept_order", { p_student: owner.id, p_instrument: sampleTicker, p_side: "buy", p_quantity: 10, p_idempotency_key: `cross-${run}-owner`, p_at: T.accepted }),
    )) as unknown as OrderPayload;
    waiterOrder = (await ok(
      admin.rpc("ledger_accept_order", { p_student: waiter.id, p_instrument: dataless, p_side: "buy", p_quantity: 3, p_idempotency_key: `cross-${run}-waiter`, p_at: T.accepted }),
    )) as unknown as OrderPayload;

    ownerBefore = privateBook(await book(owner, T.accepted));
    otherBefore = privateBook(await book(other, T.accepted));
    assert.equal(ownerBefore.cash, "100000.00");
    assert.deepEqual(ownerBefore.positions, []);
    assert.equal(ownerBefore.orders[0]?.status, "accepted");
    assert.deepEqual(await foreignRows(other, owner.id), noForeignRows, "before the fill the other student reads none of the owner's rows");

    const fillQuote = (await ok(
      admin.from("quotes").insert({ instrument_id: sampleTicker, price: "100.00", as_of: T.sampleFill, source: "sample" } as never).select("id, source").single(),
    )) as unknown as { id: string; source: string };
    const pass = await jobPass(T.firstPass);
    assert.deepEqual(pass.fill.filled.map((item) => [item.orderId, item.quoteId, item.price]), [[ownerOrder.id, fillQuote.id, "100.0000"]]);

    const ownerAfter = privateBook(await book(owner, T.firstPass));
    const otherAfter = privateBook(await book(other, T.firstPass));
    assert.equal(ownerAfter.cash, "98999.90", "the owner pays 10 x 100.00 plus $0.01 per share");
    assert.deepEqual(ownerAfter.positions, [{ instrumentId: sampleTicker, quantity: "10", costBasis: "1000.10" }]);
    const filled = ownerAfter.orders.find((item) => item.id === ownerOrder.id)!;
    assert.equal(filled.status, "filled");
    assert.equal(filled.execution?.quoteId, fillQuote.id);
    assert.equal(fillQuote.source, "sample", "the fill quote is labeled sample, not a vendor price");
    assert.deepEqual(
      ownerAfter.cashLines.slice(ownerBefore.cashLines.length).map((line) => [line.kind, line.amount]),
      [["trade", "-1000.00"], ["simulation_cost", "-0.10"]],
    );
    assert.deepEqual(otherAfter, otherBefore, "the other student's book is identical before and after the fill");
    assert.deepEqual(await foreignRows(other, owner.id), noForeignRows, "after the fill the other student still reads none of the owner's rows");
    assert.deepEqual(await foreignRows(owner, other.id), noForeignRows, "and the owner reads none of the other student's rows");
  });

  it("an unavailable market adapter supplies no quote, so the eligible order stays unfilled", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const adapter = createMarketAdapter({ MARKET_DATA_PROVIDER: "massive", MARKET_DATA_API_KEY: "placeholder" });
    const result = await adapter.quote(dataless);
    assert.equal(result.status, "unavailable");
    assert.equal("data" in result, false, "an unavailable result carries no price to store");

    const waiting = await book(waiter, T.firstPass);
    const order = waiting.orders.find((item) => item.id === waiterOrder.id)!;
    assert.ok(Date.parse(order.eligibleAt) < Date.parse(T.firstPass), "the order is past its eligibility time");
    assert.equal(order.status, "accepted", "an eligible order with no qualifying quote is not filled at a synthetic price");
    assert.equal(order.execution, null);
    assert.equal(order.reservation?.held, true);
    assert.equal(waiting.cash, "100000.00");
    assert.deepEqual(waiting.positions, []);
    const { data: stored } = await admin.from("quotes").select("as_of").eq("instrument_id", dataless).gte("as_of", order.eligibleAt);
    assert.deepEqual(stored, [], "no quote was invented for the instrument");

    await ok(admin.from("quotes").insert({ instrument_id: sampleTicker, price: "110.00", as_of: T.sampleClose, source: "sample" } as never));
    const closePass = await jobPass(T.closePass);
    assert.deepEqual(closePass.fill.filled, [], "nothing fills at the close either");
    assert.deepEqual(closePass.fill.expired, [waiterOrder.id], "the unfilled day order expires at the close");
    const expired = (await book(waiter, T.closePass)).orders.find((item) => item.id === waiterOrder.id)!;
    assert.equal(expired.status, "expired");
    assert.equal(expired.execution, null);
    assert.equal(expired.reservation?.held, false);
  });

  it("the reloaded server standing carries the rank, and a direct client rank write is rejected", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const state = await loadStandings(owner.client, new Date(T.viewed));
    assert.equal(state.status, "ready");
    const payload = state as StandingsPayload;
    assert.equal(payload.season?.id, season);
    const stored = (await ok(owner.client.rpc("latest_standings", { p_season: season }))) as Array<{ round_id: string | null; board: string; entrant_id: string; rank: number | null; return_pct: string | null }>;
    const serverRow = stored.find((row) => row.round_id === null && row.board === "individual" && row.entrant_id === owner.id)!;
    assert.equal(serverRow.rank, 1, "the filled book leads: 98999.90 cash plus 10 x 110.00");
    assert.ok(Math.abs(Number(serverRow.return_pct) - 0.000999) < 1e-12);

    // The same rows the Compete table renders, through the page's own adapter.
    const displayed = serverWindowRows(payload, "individual", "season", owner.id)!;
    const mine = displayed.find((row) => row.id === owner.id)!;
    assert.equal(mine.self, true);
    assert.equal(mine.window.rank, serverRow.rank, "the displayed rank is the server standing");
    assert.deepEqual(Object.fromEntries(displayed.map((row) => [row.id, row.window.rank])), { [owner.id]: 1, [other.id]: 2, [waiter.id]: 2 });

    const versionId = (await ok(admin.from("standing_entries").select("version_id").eq("entrant_id", owner.id).limit(1).single())) as unknown as { version_id: string };
    const attempts = {
      insertEntry: await other.client.from("standing_entries").insert({ version_id: versionId.version_id, entrant_id: `${other.id}-x`, entrant_name: "Forged", rank: 1 } as never),
      updateEntry: await other.client.from("standing_entries").update({ rank: 1 } as never).eq("entrant_id", other.id).select(),
      deleteEntry: await other.client.from("standing_entries").delete().eq("entrant_id", owner.id).select(),
      insertVersion: await other.client.from("standings_versions").insert({ season_id: season, board: "individual", as_of: T.viewed } as never),
      insertFinal: await other.client.from("finalized_results").insert({ round_id: `${season}-r1`, season_id: season, board: "individual", entrant_id: other.id, entrant_name: "Forged", rank: 1, finalized_at: T.viewed } as never),
      publish: await other.client.rpc("standings_publish", { p_season: season, p_round: null, p_board: "individual", p_as_of: T.viewed, p_entries: [{ entrant_id: other.id, entrant_name: "Forged", rank: 1 }] } as never),
      finalize: await other.client.rpc("standings_finalize_round", { p_round: `${season}-r1`, p_closed_at: "2034-01-24T05:00:00.000Z", p_results: [] } as never),
      valuation: await other.client.rpc("standings_record_valuation", { p_registration: randomUUID(), p_valued_at: T.viewed, p_status: "valued", p_equity: 1e9, p_missing: [] } as never),
    };
    for (const [label, attempt] of Object.entries(attempts)) {
      assert.ok(attempt.error, `${label} is rejected`);
      assert.equal(attempt.error!.code, "42501", `${label} is refused by a permission, not ignored`);
    }
    const reread = (await ok(owner.client.rpc("latest_standings", { p_season: season }))) as typeof stored;
    assert.deepEqual(reread, stored, "the attempts changed no standing");
  });

  it("a ranking update publishes the rank and permitted fields only, not the private holdings", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const state = (await loadStandings(other.client, new Date(T.viewed))) as StandingsPayload;
    assert.equal(state.status, "ready");
    const permitted = ["entrantId", "name", "universityId", "clubId", "rank", "return", "score", "scoreLabel", "riskAdjusted", "drawdown", "diversification", "consistency", "eligibleStudents", "institutional", "withheld", "included"].sort();
    for (const window of Object.values(state.windows)) {
      for (const rows of Object.values(window.boards)) for (const row of rows) assert.deepEqual(Object.keys(row).sort(), permitted);
    }
    const json = JSON.stringify(state);
    assert.ok(json.includes(owner.id), "the owner is ranked on the public board");
    assert.doesNotMatch(json, new RegExp(sampleTicker), "no ticker of the owner's book is published");
    assert.doesNotMatch(json, /quantity|cost_?basis|"cash"|positions|holdings|"orders"|execution/i);
    assert.doesNotMatch(json, /98999\.9|1000\.1/, "neither the owner's cash nor the position cost appears");

    const profile = await ok(other.client.rpc("public_profile", { target: owner.id }).single());
    assert.equal((profile as { holdings_public: boolean }).holdings_public, false, "holdings stay at the private default");
    assert.deepEqual(await ok(other.client.rpc("public_holdings", { target: owner.id })), [], "the public holdings projection is empty");
    const campus = await ok(other.client.rpc("public_campus", { target: owner.id }).single());
    assert.deepEqual(Object.keys(campus as object).sort(), ["club_id", "club_name", "club_official", "club_role", "verified_university"]);
    assert.deepEqual(await foreignRows(other, owner.id), noForeignRows);
    assert.deepEqual((await book(owner, T.viewed)).positions, [{ instrumentId: sampleTicker, quantity: "10", costBasis: "1000.10" }], "the owner still holds the private position");
  });

  it("a missing valuation stays unavailable and is not scored as zero", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const adapter = createMarketAdapter({ MARKET_DATA_PROVIDER: "massive", MARKET_DATA_API_KEY: "placeholder" });
    const now = new Date(T.unavailablePass);
    const stored = createStandingsValuationStore(admin, { now: () => now, seasonIds: [season] });
    // The valuation job with its prices coming from the unavailable adapter instead of stored quotes.
    const store: ValuationStore = {
      ...stored,
      async latestQuoteAtOrBefore(instrumentId) {
        const result = await adapter.quote(instrumentId);
        assert.equal(result.status, "unavailable");
        return null;
      },
    };
    const valuation = await valueAccounts({ store, clock: await ledgerSessionClock(admin), now });
    const ownerRegistration = (await book(owner, T.unavailablePass)).registrationId;
    const ownerSnapshot = valuation.snapshots.find((item) => item.accountId === ownerRegistration)!;
    assert.deepEqual(ownerSnapshot, { accountId: ownerRegistration, valuedAt: now.toISOString(), status: "unavailable", equity: null, missing: [sampleTicker] });
    const others = valuation.snapshots.filter((item) => item.accountId !== ownerRegistration);
    assert.ok(others.length === 2 && others.every((item) => item.status === "valued" && item.equity === "100000.00"), "cash-only books need no quote");

    const row = (await ok(owner.client.from("valuation_snapshots").select("status, equity::text").eq("valued_at", now.toISOString()).single())) as unknown as { status: string; equity: string | null };
    assert.deepEqual(row, { status: "unavailable", equity: null }, "the stored snapshot is unavailable, not zero");

    await publishProvisional(admin, season, now);
    const payload = (await loadStandings(other.client, new Date("2034-01-03T22:00:00.000Z"))) as StandingsPayload;
    const window = payload.windows.season;
    assert.equal(Date.parse(window.asOf), now.getTime());
    const ownerRow = window.boards.individual.find((item) => item.entrantId === owner.id)!;
    assert.equal(ownerRow.return, null, "the return is unavailable");
    assert.equal(ownerRow.rank, null, "the owner is unranked rather than ranked on a zero");
    assert.equal(ownerRow.score, null);
    assert.equal(ownerRow.scoreLabel, "Unavailable");
    assert.deepEqual(window.boards.individual.filter((item) => item.rank !== null).map((item) => [item.entrantId, item.rank, item.return]).sort(), [[other.id, 1, 0], [waiter.id, 1, 0]].sort());
    const michigan = window.boards.university.find((item) => item.entrantId === "michigan")!;
    assert.equal(michigan.eligibleStudents, 3);
    assert.equal(michigan.return, null, "the university return is withheld, not averaged with a zero");
    assert.ok(michigan.withheld.includes("return"));
  });
});
