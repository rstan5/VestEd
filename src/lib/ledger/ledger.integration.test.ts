import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eligibleAt } from "@/lib/jobs/clock";
import type { Database } from "@/lib/supabase/database";
import { buyReserve, reconcileBook, valueLedgerBook } from "./book";
import { ledgerSessionClock, runLedgerFills } from "./job-store";
import { loadLedgerBook } from "./load";
import type { LedgerBook, OrderPayload } from "./types";

// Runs against the local Supabase stack when it is up and .env.local has its keys.
// Otherwise every case is reported as skipped, never as passed. Fixture quotes are labeled sample.
try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

type Client = SupabaseClient<Database>;
type Student = { id: string; client: Client };

const run = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const createdUsers: string[] = [];
const createdInstruments: string[] = [];
let skipReason: string | false = false;
let admin: Client;
let instrumentCount = 0;

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
  const email = `ledger-${label}-${run.toLowerCase()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `${label} ${run}` } });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUsers.push(data.user.id);
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

async function instrument(kind: "stock" | "etf" | "option" | "leveraged_etf" = "stock"): Promise<string> {
  instrumentCount += 1;
  const id = `Z${run}${instrumentCount}`;
  const { error } = await admin.from("instruments").insert({ id, name: `Ledger test ${kind} ${instrumentCount}`, kind, sector: "Test" } as never);
  assert.equal(error, null);
  createdInstruments.push(id);
  return id;
}

async function quote(instrumentId: string, price: string, asOf: string): Promise<string> {
  const { data, error } = await admin
    .from("quotes")
    .insert({ instrument_id: instrumentId, price, as_of: asOf, source: "sample" } as never)
    .select("id")
    .single();
  assert.equal(error, null);
  return data!.id;
}

type Accept = { instrument: string; side?: string; quantity?: number; key?: string; at: string };

async function accept(who: Student, request: Accept) {
  const { data, error } = await admin.rpc("ledger_accept_order", {
    p_student: who.id,
    p_instrument: request.instrument,
    p_side: request.side ?? "buy",
    p_quantity: request.quantity ?? 1,
    p_idempotency_key: request.key ?? `key-${randomUUID()}`,
    p_at: request.at,
  });
  return { order: data as unknown as OrderPayload | null, error: error?.message ?? null };
}

async function acceptOk(who: Student, request: Accept): Promise<OrderPayload> {
  const { order, error } = await accept(who, request);
  assert.equal(error, null);
  return order!;
}

async function register(who: Student, at: string): Promise<string> {
  const { data, error } = await admin.rpc("ledger_register", { p_student: who.id, p_season: null, p_at: at });
  assert.equal(error, null);
  return data!;
}

async function book(who: Student, at: string): Promise<LedgerBook> {
  const state = await loadLedgerBook(who.client, new Date(at));
  assert.equal(state.status, "ready", state.status === "unavailable" ? state.message : undefined);
  return (state as { book: LedgerBook }).book;
}

/** Everything a failed request must not change. */
async function snapshot(who: Student, at: string) {
  const current = await book(who, at);
  return {
    cash: current.cash,
    positions: current.positions,
    orders: current.orders.map((order) => [order.id, order.status, order.reservation?.held ?? null]),
    cashLines: current.cashLines.map((line) => [line.kind, line.amount]),
  };
}

async function order(who: Student, id: string, at: string) {
  const found = (await book(who, at)).orders.find((item) => item.id === id);
  assert.ok(found, `order ${id} is in the owner's book`);
  return found;
}

const fills = (who: Student | Student[], at: string) =>
  runLedgerFills(admin, new Date(at), (Array.isArray(who) ? who : [who]).map((item) => item.id));

describe("server ledger against local Supabase", () => {
  before(async () => {
    skipReason = await stackReason();
    if (skipReason) return;
    admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  after(async () => {
    if (skipReason || !admin) return;
    await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
    if (createdInstruments.length) await admin.from("instruments").delete().in("id", createdInstruments);
  });

  it("season registration credits exactly $100000.00 once, and a round boundary does not refill or reset the book", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ada = await student("season");
    const ticker = await instrument();
    const registrationId = await register(ada, "2026-11-13T15:00:00.000Z");
    const opened = await book(ada, "2026-11-13T15:00:00.000Z");
    assert.equal(opened.registrationId, registrationId);
    assert.equal(opened.startingCapital, "100000.00");
    assert.equal(opened.cash, "100000.00");
    assert.deepEqual(opened.cashLines.map((line) => [line.kind, line.amount]), [["opening", "100000.00"]]);

    await quote(ticker, "50.00", "2026-11-13T14:00:00.000Z");
    const buy = await acceptOk(ada, { instrument: ticker, quantity: 10, at: "2026-11-13T15:00:00.000Z" });
    await quote(ticker, "50.00", "2026-11-13T15:20:00.000Z");
    assert.deepEqual((await fills(ada, "2026-11-13T15:30:00.000Z")).filled.map((item) => item.orderId), [buy.id]);
    const beforeBoundary = await snapshot(ada, "2026-11-13T21:00:00.000Z");

    const { data: rounds, error } = await ada.client.from("rounds").select("id, number, starts_at, ends_at").eq("season_id", opened.seasonId).order("number");
    assert.equal(error, null);
    assert.ok(rounds && rounds.length >= 2);
    const newYorkDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso));
    for (const [index, round] of rounds.entries()) {
      const start = new Date(round.starts_at);
      const end = new Date(round.ends_at);
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
      assert.equal(days, 21, `${round.id} spans three weeks`);
      assert.equal(newYorkDay(round.starts_at).slice(12), newYorkDay(round.ends_at).slice(12), `${round.id} ends at the same New York time it starts`);
      const next: (typeof rounds)[number] | undefined = rounds[index + 1];
      if (next) assert.equal(new Date(next.starts_at).getTime(), end.getTime(), `${next.id} starts exactly when ${round.id} ends`);
    }
    const boundary = rounds.find((round) => new Date(round.starts_at) > new Date("2026-11-13T21:00:00.000Z"));
    assert.ok(boundary, "a later round exists");

    const afterBoundaryAt = new Date(new Date(boundary.starts_at).getTime() + 15 * 3_600_000).toISOString();
    assert.equal(await register(ada, afterBoundaryAt), registrationId, "the later round keeps the same season registration");
    await fills(ada, afterBoundaryAt);
    assert.deepEqual(await snapshot(ada, afterBoundaryAt), beforeBoundary, "cash, positions, and cash lines survive the round boundary");
    const afterBook = await book(ada, afterBoundaryAt);
    assert.equal(afterBook.cashLines.filter((line) => line.kind === "opening").length, 1, "no automatic refill");
    assert.equal(afterBook.cash, "99499.90");
    assert.deepEqual(afterBook.positions, [{ instrumentId: ticker, quantity: "10", costBasis: "500.10" }]);
  });

  it("accepts whole-share long stock and ETF orders and rejects fractional, zero, negative, option, leveraged, and short orders", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ben = await student("shape");
    const [stock, etf, option, leveraged] = await Promise.all([instrument("stock"), instrument("etf"), instrument("option"), instrument("leveraged_etf")]);
    await Promise.all([stock, etf, option, leveraged].map((id) => quote(id, "40.00", "2026-11-10T14:00:00.000Z")));
    const at = "2026-11-10T15:00:00.000Z";
    await register(ben, at);
    const before = await snapshot(ben, at);

    const cases: Array<[string, Accept, string]> = [
      ["fraction", { instrument: stock, quantity: 1.5, at }, "fractional_quantity"],
      ["zero", { instrument: stock, quantity: 0, at }, "quantity_not_positive"],
      ["negative", { instrument: stock, quantity: -3, at }, "quantity_not_positive"],
      ["option", { instrument: option, quantity: 1, at }, "instrument_not_allowed"],
      ["leveraged product", { instrument: leveraged, quantity: 1, at }, "instrument_not_allowed"],
      ["short side", { instrument: stock, side: "short", quantity: 1, at }, "invalid_side"],
      ["sell short side", { instrument: stock, side: "sell_short", quantity: 1, at }, "invalid_side"],
      ["short sale of an unheld stock", { instrument: stock, side: "sell", quantity: 1, at }, "insufficient_shares"],
      ["margin buy beyond cash", { instrument: stock, quantity: 3000, at }, "insufficient_cash"],
    ];
    for (const [label, request, code] of cases) {
      const { order, error } = await accept(ben, request);
      assert.equal(error, code, label);
      assert.equal(order, null, label);
    }
    assert.deepEqual(await snapshot(ben, at), before, "rejected orders leave the book unchanged");

    const stockOrder = await acceptOk(ben, { instrument: stock, quantity: 2, at });
    const etfOrder = await acceptOk(ben, { instrument: etf, quantity: 3, at });
    assert.equal(stockOrder.status, "accepted");
    assert.equal(stockOrder.quantity, 2);
    assert.equal(etfOrder.status, "accepted");
    assert.equal(etfOrder.instrument_id, etf);
  });

  it("rejects a buy beyond available cash and a sell beyond owned shares without changing the book", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const cy = await student("funds");
    const ticker = await instrument();
    await quote(ticker, "1000.00", "2026-11-10T14:00:00.000Z");
    const at = "2026-11-10T15:00:00.000Z";

    // 95 shares reserve 95 x 1000 x 1.05 + 0.95 = 99,750.95, which fits; a second 1-share buy then does not.
    const big = await acceptOk(cy, { instrument: ticker, quantity: 95, at });
    assert.equal(big.reservation?.amount, "99750.95");
    const beforeBuy = await snapshot(cy, at);
    const second = await accept(cy, { instrument: ticker, quantity: 1, at });
    assert.equal(second.error, "insufficient_cash");
    assert.deepEqual(await snapshot(cy, at), beforeBuy);

    await quote(ticker, "1000.00", "2026-11-10T15:16:00.000Z");
    await fills(cy, "2026-11-10T15:20:00.000Z");
    const owned = await book(cy, "2026-11-10T15:20:00.000Z");
    assert.deepEqual(owned.positions.map((item) => [item.instrumentId, item.quantity]), [[ticker, "95"]]);

    const sellAt = "2026-11-10T16:00:00.000Z";
    const beforeSell = await snapshot(cy, sellAt);
    assert.equal((await accept(cy, { instrument: ticker, side: "sell", quantity: 96, at: sellAt })).error, "insufficient_shares");
    assert.deepEqual(await snapshot(cy, sellAt), beforeSell, "an oversized sell leaves no negative position");
    await acceptOk(cy, { instrument: ticker, side: "sell", quantity: 95, at: sellAt });
    const committed = await snapshot(cy, sellAt);
    assert.equal((await accept(cy, { instrument: ticker, side: "sell", quantity: 1, at: sellAt })).error, "insufficient_shares", "shares held for an open sell are not sold twice");
    assert.deepEqual(await snapshot(cy, sellAt), committed);
  });

  it("an identical replay returns the original order with one reservation, and a changed payload conflicts", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const di = await student("replay");
    const ticker = await instrument();
    await quote(ticker, "20.00", "2026-11-10T14:00:00.000Z");
    const at = "2026-11-10T15:00:00.000Z";
    const key = `replay-${run}`;
    await quote(ticker, "20.00", "2026-11-02T20:00:00.000Z");

    const first = await acceptOk(di, { instrument: ticker, quantity: 5, key, at });
    const [second, third] = await Promise.all([
      acceptOk(di, { instrument: ticker, quantity: 5, key, at: "2026-11-10T15:01:00.000Z" }),
      acceptOk(di, { instrument: ticker.toLowerCase(), side: " BUY ", quantity: 5, key, at: "2026-11-10T15:02:00.000Z" }),
    ]);
    assert.equal(first.replayed, false);
    assert.equal(second.id, first.id);
    assert.equal(third.id, first.id);
    assert.equal(second.replayed, true);
    assert.equal(second.accepted_at, first.accepted_at, "the replay returns the original receipt time");
    assert.deepEqual({ ...second, replayed: false }, first);

    const conflict = await accept(di, { instrument: ticker, quantity: 6, key, at });
    assert.equal(conflict.error, "idempotency_conflict");
    const current = await book(di, at);
    assert.equal(current.orders.length, 1, "one order exists for the key");
    assert.equal(current.orders.filter((item) => item.reservation?.held).length, 1, "one reservation");
    assert.equal(valueLedgerBook(current).reservedCash, buyReserve(5, "20.00"));

    const { data: own, error } = await di.client.rpc("place_order", { p_instrument: ticker, p_side: "buy", p_quantity: 1, p_idempotency_key: `own-${run}` });
    assert.equal(error, null);
    const again = await di.client.rpc("place_order", { p_instrument: ticker, p_side: "buy", p_quantity: 1, p_idempotency_key: `own-${run}` });
    assert.equal((again.data as unknown as OrderPayload).id, (own as unknown as OrderPayload).id);
  });

  it("cancel before fill releases the reserve and blocks a later fill; a filled order cannot be cancelled", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const [eve, mallory] = await Promise.all([student("cancel"), student("intruder")]);
    const ticker = await instrument();
    await quote(ticker, "100.00", "2026-11-10T14:00:00.000Z");
    const at = "2026-11-10T15:00:00.000Z";
    await register(eve, at);
    const placed = await acceptOk(eve, { instrument: ticker, quantity: 10, at });
    assert.equal(valueLedgerBook(await book(eve, at)).availableCash, "98949.90");

    assert.equal((await mallory.client.rpc("cancel_order", { p_order: placed.id })).error?.message, "order_not_found", "another student cannot cancel it");
    const { data, error } = await admin.rpc("ledger_cancel_order", { p_student: eve.id, p_order: placed.id, p_at: "2026-11-10T15:05:00.000Z" });
    assert.equal(error, null);
    const cancelled = data as unknown as OrderPayload;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.reservation?.held, false);
    assert.equal(cancelled.reservation?.release_reason, "cancelled");
    const released = valueLedgerBook(await book(eve, "2026-11-10T15:05:00.000Z"));
    assert.equal(released.reservedCash, "0.00");
    assert.equal(released.availableCash, "100000.00");

    const late = await quote(ticker, "100.00", "2026-11-10T15:16:00.000Z");
    const result = await fills(eve, "2026-11-10T15:20:00.000Z");
    assert.deepEqual(result.filled, []);
    const direct = await admin.rpc("ledger_fill_order", { p_order: placed.id, p_quote: late, p_at: "2026-11-10T15:20:00.000Z" });
    assert.deepEqual(direct.data, { status: "skipped", reason: "order_not_open" });
    const after = await book(eve, "2026-11-10T15:20:00.000Z");
    assert.deepEqual(after.positions, []);
    assert.equal(after.cash, "100000.00");
    assert.equal((await admin.rpc("ledger_cancel_order", { p_student: eve.id, p_order: placed.id, p_at: "2026-11-10T15:21:00.000Z" })).error?.message, "order_not_open");

    const filled = await acceptOk(eve, { instrument: ticker, quantity: 1, at: "2026-11-10T16:00:00.000Z" });
    await quote(ticker, "100.00", "2026-11-10T16:20:00.000Z");
    await fills(eve, "2026-11-10T16:25:00.000Z");
    assert.equal((await order(eve, filled.id, "2026-11-10T16:25:00.000Z")).status, "filled");
    const refused = await admin.rpc("ledger_cancel_order", { p_student: eve.id, p_order: filled.id, p_at: "2026-11-10T16:30:00.000Z" });
    assert.equal(refused.error?.message, "order_not_open", "cancel is not possible after fill");
    assert.equal(reconcileBook(await book(eve, "2026-11-10T16:30:00.000Z")).ok, true);
  });

  it("closed-session orders are accepted, ignore stored quotes, and wait past an open that is inside the 15-minute wait", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const fay = await student("closed");
    const ticker = await instrument();
    await quote(ticker, "30.00", "2026-11-09T20:59:00.000Z");

    // 09:20 New York, before the open. The 09:30 open is inside the wait, so eligibility is 09:35.
    const early = await acceptOk(fay, { instrument: ticker, quantity: 4, at: "2026-11-10T14:20:00.000Z" });
    assert.equal(early.status, "accepted", "an order outside the session is queued, not rejected");
    assert.equal(new Date(early.eligible_at).toISOString(), "2026-11-10T14:35:00.000Z");
    await quote(ticker, "30.50", "2026-11-10T14:30:00.000Z");
    const atOpen = await fills(fay, "2026-11-10T14:31:00.000Z");
    assert.deepEqual(atOpen.filled, []);
    assert.equal((await order(fay, early.id, "2026-11-10T14:31:00.000Z")).status, "accepted", "the opening quote precedes eligibility");
    const qualifying = await quote(ticker, "31.20", "2026-11-10T14:36:00.000Z");
    const filled = await fills(fay, "2026-11-10T14:40:00.000Z");
    assert.deepEqual(filled.filled, [{ orderId: early.id, quoteId: qualifying, price: "31.2000", filledAt: filled.filled[0]?.filledAt }]);
    const execution = (await order(fay, early.id, "2026-11-10T14:40:00.000Z")).execution;
    assert.equal(execution?.price, "31.2000");
    assert.equal(execution?.quoteId, qualifying);

    // 16:30 New York. The 15:59 quote already existed, so nothing fills overnight.
    const overnightTicker = await instrument();
    await quote(overnightTicker, "30.00", "2026-11-10T20:59:00.000Z");
    const overnight = await acceptOk(fay, { instrument: overnightTicker, quantity: 2, at: "2026-11-10T21:30:00.000Z" });
    assert.equal(new Date(overnight.eligible_at).toISOString(), "2026-11-11T14:30:00.000Z");
    for (const at of ["2026-11-10T21:31:00.000Z", "2026-11-11T03:00:00.000Z", "2026-11-11T14:29:00.000Z"]) {
      assert.deepEqual((await fills(fay, at)).filled, []);
      assert.equal((await order(fay, overnight.id, at)).status, "accepted");
    }
    const opening = await quote(overnightTicker, "31.00", "2026-11-11T14:30:00.000Z");
    const next = await fills(fay, "2026-11-11T14:31:00.000Z");
    assert.equal(next.filled[0]?.quoteId, opening, "the open after the wait is the first qualifying quote");
  });

  it("eligibility is the later of the two clocks and the first stored quote at or after it is the fill", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const gus = await student("clocks");
    const clock = await ledgerSessionClock(admin);

    // Same session: the 15-minute wait is the later clock.
    const sameSession = await instrument();
    await quote(sameSession, "10.00", "2026-11-11T14:45:00.000Z");
    const waitOrder = await acceptOk(gus, { instrument: sameSession, quantity: 3, at: "2026-11-11T15:00:00.000Z" });
    assert.equal(new Date(waitOrder.eligible_at).toISOString(), eligibleAt(waitOrder.accepted_at, clock).eligibleAt.toISOString(), "SQL and the job clock agree");
    const tooEarly = await quote(sameSession, "10.10", "2026-11-11T15:10:00.000Z");
    assert.deepEqual((await fills(gus, "2026-11-11T15:12:00.000Z")).filled, []);
    assert.equal((await order(gus, waitOrder.id, "2026-11-11T15:12:00.000Z")).status, "accepted");
    const exact = await quote(sameSession, "10.20", "2026-11-11T15:15:00.000Z");
    const later = await quote(sameSession, "10.30", "2026-11-11T15:16:00.000Z");
    const blocked = await admin.rpc("ledger_fill_order", { p_order: waitOrder.id, p_quote: tooEarly, p_at: "2026-11-11T15:20:00.000Z" });
    assert.deepEqual(blocked.data, { status: "skipped", reason: "quote_before_eligibility" });
    const skipped = await admin.rpc("ledger_fill_order", { p_order: waitOrder.id, p_quote: later, p_at: "2026-11-11T15:20:00.000Z" });
    assert.deepEqual(skipped.data, { status: "skipped", reason: "not_first_qualifying_quote" });
    const sameResult = await fills(gus, "2026-11-11T15:20:00.000Z");
    assert.equal(sameResult.filled[0]?.quoteId, exact);
    assert.equal((await order(gus, waitOrder.id, "2026-11-11T15:20:00.000Z")).execution?.price, "10.2000");

    // Before the open: the open is the earlier clock, so the opening quote does not qualify.
    const preOpen = await instrument();
    await quote(preOpen, "10.00", "2026-11-11T20:59:00.000Z");
    const openOrder = await acceptOk(gus, { instrument: preOpen, quantity: 3, at: "2026-11-12T14:25:00.000Z" });
    assert.equal(new Date(openOrder.eligible_at).toISOString(), "2026-11-12T14:40:00.000Z");
    assert.equal(new Date(openOrder.eligible_at).toISOString(), eligibleAt(openOrder.accepted_at, clock).eligibleAt.toISOString());
    await quote(preOpen, "10.10", "2026-11-12T14:30:00.000Z");
    assert.deepEqual((await fills(gus, "2026-11-12T14:35:00.000Z")).filled, []);
    assert.equal((await order(gus, openOrder.id, "2026-11-12T14:35:00.000Z")).status, "accepted");
    const first = await quote(preOpen, "10.20", "2026-11-12T14:41:00.000Z");
    await quote(preOpen, "10.25", "2026-11-12T14:42:00.000Z");
    const openResult = await fills(gus, "2026-11-12T14:45:00.000Z");
    assert.equal(openResult.filled[0]?.quoteId, first);
  });

  it("a day order expires at the close of the session it can work, including an early close and after an overnight wait", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const hal = await student("expiry");

    // Friday 2026-11-27 closes at 13:00 New York.
    const earlyClose = await instrument();
    await quote(earlyClose, "25.00", "2026-11-25T20:00:00.000Z");
    const working = await acceptOk(hal, { instrument: earlyClose, quantity: 2, at: "2026-11-27T15:00:00.000Z" });
    assert.equal(new Date(working.expires_at).toISOString(), "2026-11-27T18:00:00.000Z");
    assert.deepEqual((await fills(hal, "2026-11-27T17:59:00.000Z")).waiting, [working.id]);
    const notYet = await admin.rpc("ledger_expire_order", { p_order: working.id, p_at: "2026-11-27T17:59:00.000Z" });
    assert.equal(notYet.data, false, "the database refuses to expire before the close");
    assert.deepEqual((await fills(hal, "2026-11-27T18:00:00.000Z")).expired, [working.id]);
    const expired = await order(hal, working.id, "2026-11-27T18:00:00.000Z");
    assert.equal(expired.status, "expired");
    assert.equal(expired.reservation?.held, false);
    assert.equal(expired.reservation?.releaseReason, "expired");

    // Accepted at 16:30 Monday: stays accepted overnight, expires at Tuesday's close.
    const overnightTicker = await instrument();
    await quote(overnightTicker, "25.00", "2026-11-16T20:59:00.000Z");
    const overnight = await acceptOk(hal, { instrument: overnightTicker, quantity: 2, at: "2026-11-16T21:30:00.000Z" });
    assert.equal(new Date(overnight.expires_at).toISOString(), "2026-11-17T21:00:00.000Z");
    for (const at of ["2026-11-16T22:00:00.000Z", "2026-11-17T03:00:00.000Z", "2026-11-17T20:59:00.000Z"]) {
      const pass = await fills(hal, at);
      assert.deepEqual(pass.expired, [], `not expired at ${at}`);
      assert.equal((await order(hal, overnight.id, at)).status, "accepted");
    }
    assert.deepEqual((await fills(hal, "2026-11-17T21:00:00.000Z")).expired, [overnight.id]);
    const afterClose = await quote(overnightTicker, "25.00", "2026-11-17T21:05:00.000Z");
    assert.deepEqual((await fills(hal, "2026-11-18T15:00:00.000Z")).filled, []);
    const direct = await admin.rpc("ledger_fill_order", { p_order: overnight.id, p_quote: afterClose, p_at: "2026-11-18T15:00:00.000Z" });
    assert.deepEqual(direct.data, { status: "skipped", reason: "order_not_open" });
    const final = await book(hal, "2026-11-18T15:00:00.000Z");
    assert.equal(final.cash, "100000.00");
    assert.deepEqual(final.positions, []);
    assert.equal(valueLedgerBook(final).reservedCash, "0.00");
  });

  it("charges $0.01 per share on buys and sells, and rejects an over-reserve fill without shrinking it", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ivy = await student("costs");
    const ticker = await instrument();
    await quote(ticker, "100.00", "2026-11-10T14:00:00.000Z");
    const reserve = await admin.rpc("ledger_buy_reserve", { p_quantity: 7, p_price: "123.4567" });
    assert.equal(String(reserve.data), buyReserve(7, "123.4567"), "the browser estimate matches the database reserve");

    const buy = await acceptOk(ivy, { instrument: ticker, quantity: 10, at: "2026-11-10T15:00:00.000Z" });
    await quote(ticker, "100.00", "2026-11-10T15:16:00.000Z");
    await fills(ivy, "2026-11-10T15:20:00.000Z");
    const sell = await acceptOk(ivy, { instrument: ticker, side: "sell", quantity: 4, at: "2026-11-10T16:00:00.000Z" });
    assert.equal(sell.reservation?.kind, "shares");
    await quote(ticker, "110.00", "2026-11-10T16:16:00.000Z");
    await fills(ivy, "2026-11-10T16:20:00.000Z");

    const traded = await book(ivy, "2026-11-10T16:20:00.000Z");
    const lines = traded.cashLines.map((line) => [line.kind, line.amount, line.orderId]);
    assert.deepEqual(lines, [
      ["opening", "100000.00", null],
      ["trade", "-1000.00", buy.id],
      ["simulation_cost", "-0.10", buy.id],
      ["trade", "440.00", sell.id],
      ["simulation_cost", "-0.04", sell.id],
    ]);
    assert.equal(traded.cash, "99439.86");
    assert.deepEqual(traded.positions, [{ instrumentId: ticker, quantity: "6", costBasis: traded.positions[0]?.costBasis }]);
    assert.equal(Number(traded.positions[0]?.costBasis).toFixed(2), "600.06");
    assert.equal(valueLedgerBook(traded).realized, "39.92");

    // Reference 100.00 reserves 525.05 for 5 shares. A fill at 106.00 needs 530.05.
    const big = await acceptOk(ivy, { instrument: ticker, quantity: 5, at: "2026-11-10T17:00:00.000Z" });
    assert.equal(big.reservation?.amount, buyReserve(5, "110.00"));
    const overAt = "2026-11-10T17:16:00.000Z";
    await quote(ticker, "120.00", overAt);
    const result = await fills(ivy, "2026-11-10T17:20:00.000Z");
    assert.deepEqual(result.rejected.map((item) => [item.orderId, item.reason]), [[big.id, "debit_exceeds_reserve"]]);
    const after = await book(ivy, "2026-11-10T17:20:00.000Z");
    const rejected = after.orders.find((item) => item.id === big.id);
    assert.equal(rejected?.status, "rejected");
    assert.equal(rejected?.execution, null);
    assert.equal(rejected?.reservation?.held, false);
    assert.equal(after.cash, "99439.86");
    assert.deepEqual(after.positions, traded.positions, "the quantity was not reduced to fit");
  });

  it("fill, reject, and cancel all reconcile cash, reserves, positions, and executions", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const jo = await student("reconcile");
    const ticker = await instrument();
    await quote(ticker, "50.00", "2026-11-10T14:00:00.000Z");
    const filled = await acceptOk(jo, { instrument: ticker, quantity: 20, at: "2026-11-10T15:00:00.000Z" });
    const cancelled = await acceptOk(jo, { instrument: ticker, quantity: 3, at: "2026-11-10T15:01:00.000Z" });
    await admin.rpc("ledger_cancel_order", { p_student: jo.id, p_order: cancelled.id, p_at: "2026-11-10T15:02:00.000Z" });
    await quote(ticker, "50.00", "2026-11-10T15:16:00.000Z");
    await fills(jo, "2026-11-10T15:17:00.000Z");
    const rejected = await acceptOk(jo, { instrument: ticker, quantity: 2, at: "2026-11-10T16:00:00.000Z" });
    await quote(ticker, "70.00", "2026-11-10T16:16:00.000Z");
    await fills(jo, "2026-11-10T16:17:00.000Z");

    const final = await book(jo, "2026-11-10T16:17:00.000Z");
    const statuses = Object.fromEntries(final.orders.map((item) => [item.id, item.status]));
    assert.deepEqual(statuses, { [filled.id]: "filled", [cancelled.id]: "cancelled", [rejected.id]: "rejected" });
    const check = reconcileBook(final);
    assert.deepEqual(check, {
      cash: "98999.80",
      ledgerTotal: "98999.80",
      cashMatchesLedger: true,
      reservedCash: "0.00",
      reservedShares: "0",
      heldByClosedOrders: 0,
      executions: 1,
      filledOrders: 1,
      ok: true,
    });
    const valuation = valueLedgerBook(final);
    assert.equal(valuation.equity, "100399.80", "equity is cash plus 20 shares at the latest stored quote");
    assert.equal(valuation.invested, "1400.00");
  });

  it("students cannot supply a price, a clock, or another account, and cannot read another book", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const [kim, lee] = await Promise.all([student("owner"), student("other")]);
    const ticker = await instrument();
    const reference = await quote(ticker, "12.00", "2026-11-02T20:00:00.000Z");

    // The database clock is read through a probe quote's recorded_at so host/DB skew cannot flake the check.
    const probeTicker = await instrument();
    const serverClock = async () => {
      const { data, error } = await admin
        .from("quotes")
        .insert({ instrument_id: probeTicker, price: "1.00", as_of: "2000-01-01T00:00:00.000Z", source: "sample" } as never)
        .select("recorded_at")
        .single();
      assert.equal(error, null);
      return new Date((data as { recorded_at: string }).recorded_at).getTime();
    };

    const clockBefore = await serverClock();
    const placed = await kim.client.rpc("place_order", { p_instrument: ticker, p_side: "buy", p_quantity: 2, p_idempotency_key: `own-${run}-kim` });
    assert.equal(placed.error, null);
    const clockAfter = await serverClock();
    const stored = placed.data as unknown as OrderPayload;
    assert.equal(stored.student_id, kim.id, "the account is the signed-in student");
    const acceptedAt = new Date(stored.accepted_at).getTime();
    assert.ok(acceptedAt >= clockBefore && acceptedAt <= clockAfter, "the receipt time is the server clock");
    assert.equal(stored.reference_quote_id, reference, "the price reference is a stored quote");
    assert.equal(stored.reference_price, "12.0000");

    const withPrice = await kim.client.rpc("place_order", {
      p_instrument: ticker,
      p_side: "buy",
      p_quantity: 1,
      p_idempotency_key: `price-${run}`,
      p_price: 0.01,
    } as never);
    assert.notEqual(withPrice.error, null, "an extra price argument is not accepted");
    const forged = await kim.client.rpc("ledger_accept_order", {
      p_student: lee.id,
      p_instrument: ticker,
      p_side: "buy",
      p_quantity: 1,
      p_idempotency_key: `forged-${run}`,
      p_at: "2026-11-10T15:00:00.000Z",
    });
    assert.notEqual(forged.error, null, "a student cannot pick the account or the clock");
    const fill = await kim.client.rpc("ledger_fill_order", { p_order: stored.id, p_quote: reference, p_at: new Date().toISOString() });
    assert.notEqual(fill.error, null, "a student cannot fill an order");
    const insert = await kim.client.from("orders").insert({ instrument_id: ticker } as never);
    assert.notEqual(insert.error, null, "no direct writes to the ledger tables");

    for (const table of ["registrations", "orders", "order_reservations", "cash_ledger", "positions", "executions"] as const) {
      const own = await kim.client.from(table).select("student_id");
      assert.equal(own.error, null);
      assert.ok((own.data ?? []).every((row) => row.student_id === kim.id), `${table} shows only the owner's rows`);
      const other = await lee.client.from(table).select("student_id").eq("student_id", kim.id);
      assert.deepEqual(other.data, [], `another student reads no ${table} rows`);
    }
    assert.equal((await lee.client.rpc("cancel_order", { p_order: stored.id })).error?.message, "order_not_found");
  });
});
