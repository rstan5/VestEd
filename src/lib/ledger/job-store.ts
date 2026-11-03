import type { SupabaseClient } from "@supabase/supabase-js";
import { newYorkSessionClock, type SessionCalendar, type SessionClock } from "@/lib/jobs/clock";
import { fillEligibleOrders, type FillJobResult } from "@/lib/jobs/fill";
import type { FillOutcome, FillStore } from "@/lib/jobs/types";
import type { Database } from "@/lib/supabase/database";

/** A service-role client. Never create one in code that reaches the browser. */
export type ServiceClient = SupabaseClient<Database>;

export type LedgerFillStoreOptions = {
  /** The job clock. Fills are recorded at this time and may not use a quote stamped after it. */
  now: () => Date;
  /** Restricts the pass to these students, for example one shard of a hosted job. */
  studentIds?: string[];
};

/** FillStore over the Postgres ledger. Each mutation is one SQL function call, so it is atomic. */
export function createLedgerFillStore(client: ServiceClient, options: LedgerFillStoreOptions): FillStore {
  return {
    async acceptedOrders() {
      let query = client
        .from("orders")
        .select("id, registration_id, instrument_id, side, quantity, accepted_at")
        .eq("status", "accepted")
        .order("eligible_at", { ascending: true });
      if (options.studentIds) query = query.in("student_id", options.studentIds);
      const { data, error } = await query;
      if (error) throw new Error(`Accepted orders could not be read: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        accountId: row.registration_id,
        instrumentId: row.instrument_id,
        side: row.side,
        quantity: row.quantity,
        acceptedAt: row.accepted_at,
      }));
    },

    async firstQuoteAtOrAfter(instrumentId, at) {
      const { data, error } = await client
        .from("quotes")
        .select("id, instrument_id, price::text, as_of")
        .eq("instrument_id", instrumentId)
        .gte("as_of", at.toISOString())
        .order("as_of", { ascending: true })
        .order("recorded_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Quotes could not be read: ${error.message}`);
      return data ? { id: data.id, instrumentId: data.instrument_id, price: data.price, asOf: data.as_of } : null;
    },

    async fillOrder({ orderId, quoteId }) {
      const { data, error } = await client.rpc("ledger_fill_order", { p_order: orderId, p_quote: quoteId, p_at: options.now().toISOString() });
      if (error) throw new Error(`Fill failed for ${orderId}: ${error.message}`);
      const outcome = data as { status: FillOutcome["status"]; reason?: string };
      if (outcome.status === "filled") return { status: "filled" };
      return { status: outcome.status, reason: outcome.reason ?? "unknown" };
    },

    async expireOrder(orderId, at) {
      const { data, error } = await client.rpc("ledger_expire_order", { p_order: orderId, p_at: at.toISOString() });
      if (error) throw new Error(`Expiry failed for ${orderId}: ${error.message}`);
      return data === true;
    },
  };
}

/** Holidays and early closes from public.market_calendar, the same rows the SQL session function reads. */
export async function loadSessionCalendar(client: ServiceClient): Promise<SessionCalendar> {
  const { data, error } = await client.from("market_calendar").select("session_date, closed, close_time");
  if (error) throw new Error(`Market calendar could not be read: ${error.message}`);
  const calendar: Required<SessionCalendar> = { closedDates: [], earlyCloses: {} };
  for (const row of data ?? []) {
    if (row.closed) calendar.closedDates.push(row.session_date);
    else if (row.close_time) calendar.earlyCloses[row.session_date] = row.close_time.slice(0, 5);
  }
  return calendar;
}

export async function ledgerSessionClock(client: ServiceClient): Promise<SessionClock> {
  return newYorkSessionClock(await loadSessionCalendar(client));
}

/** One fill pass over the Postgres ledger through the shared fill job. */
export async function runLedgerFills(client: ServiceClient, now: Date, studentIds?: string[]): Promise<FillJobResult> {
  const clock = await ledgerSessionClock(client);
  const store = createLedgerFillStore(client, { now: () => now, studentIds });
  return fillEligibleOrders({ store, clock, now });
}
