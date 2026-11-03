import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { CashLine, LedgerBook, LedgerExecution, LedgerOrder, LedgerQuote, LedgerState } from "./types";

export type LedgerClient = SupabaseClient<Database>;

const ORDER_COLUMNS =
  "id, student_id, instrument_id, side, quantity, idempotency_key, status, accepted_at, eligible_at, expires_at, reference_price::text, closed_at, reason";
const EXECUTION_COLUMNS =
  "id, order_id, quote_id, price::text, gross::text, simulation_cost::text, net_cash::text, realized::text, executed_at";

const unavailable = (message: string): LedgerState => ({ status: "unavailable", message });

/** The open season, or the next one. Mirrors the default in public.ledger_register. */
async function currentSeason(client: LedgerClient, now: Date) {
  const { data, error } = await client
    .from("seasons")
    .select("id, name, starts_at, ends_at")
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: true });
  if (error) return { error };
  const open = (data ?? []).find((season) => new Date(season.starts_at) <= now);
  return { season: open ?? data?.[0] ?? null };
}

/**
 * Reads the signed-in student's own book through Row Level Security. Registers the student
 * for the current season on first read, which credits the season starting capital once.
 */
export async function loadLedgerBook(client: LedgerClient, now = new Date()): Promise<LedgerState> {
  const { season, error: seasonError } = await currentSeason(client, now);
  if (seasonError) return unavailable("The ledger did not respond.");
  if (!season) return unavailable("No season is open for registration.");

  const registrationColumns = "id, season_id, student_id, starting_capital::text, cash::text, registered_at";
  let registration = await client.from("registrations").select(registrationColumns).eq("season_id", season.id).maybeSingle();
  if (!registration.error && !registration.data) {
    const registered = await client.rpc("register_for_season", { p_season: season.id });
    if (registered.error) return unavailable("Your season book could not be opened.");
    registration = await client.from("registrations").select(registrationColumns).eq("season_id", season.id).maybeSingle();
  }
  if (registration.error || !registration.data) return unavailable("Your season book could not be loaded.");
  const reg = registration.data;

  const [positions, orders, reservations, executions, cash, quotes, instruments] = await Promise.all([
    client.from("positions").select("instrument_id, quantity::text, cost_basis::text").eq("registration_id", reg.id).order("instrument_id"),
    client.from("orders").select(ORDER_COLUMNS).eq("registration_id", reg.id).order("accepted_at", { ascending: false }),
    client
      .from("order_reservations")
      .select("order_id, kind, amount::text, released_at, release_reason")
      .eq("registration_id", reg.id),
    client.from("executions").select(EXECUTION_COLUMNS).eq("registration_id", reg.id),
    client.from("cash_ledger").select("id, kind, amount::text, order_id, memo, created_at").eq("registration_id", reg.id).order("id"),
    client.rpc("latest_quotes", { p_at: now.toISOString() }),
    client.from("instruments").select("id, name, kind, sector").eq("tradable", true).in("kind", ["stock", "etf"]).order("id"),
  ]);
  if (positions.error || orders.error || reservations.error || executions.error || cash.error || quotes.error || instruments.error) {
    return unavailable("Part of your book could not be loaded.");
  }

  const reservationsByOrder = new Map((reservations.data ?? []).map((row) => [row.order_id, row]));
  const executionsByOrder = new Map<string, LedgerExecution>(
    (executions.data ?? []).map((row) => [
      row.order_id,
      {
        id: row.id,
        orderId: row.order_id,
        quoteId: row.quote_id,
        price: row.price,
        gross: row.gross,
        simulationCost: row.simulation_cost,
        netCash: row.net_cash,
        realized: row.realized,
        executedAt: row.executed_at,
      },
    ]),
  );

  const ledgerOrders: LedgerOrder[] = (orders.data ?? []).map((row) => {
    const reservation = reservationsByOrder.get(row.id);
    return {
      id: row.id,
      studentId: row.student_id,
      instrumentId: row.instrument_id,
      side: row.side,
      quantity: row.quantity,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      acceptedAt: row.accepted_at,
      eligibleAt: row.eligible_at,
      expiresAt: row.expires_at,
      referencePrice: row.reference_price,
      reservation: reservation
        ? {
            kind: reservation.kind,
            amount: reservation.amount,
            held: reservation.released_at === null,
            releasedAt: reservation.released_at,
            releaseReason: reservation.release_reason,
          }
        : null,
      execution: executionsByOrder.get(row.id) ?? null,
      closedAt: row.closed_at,
      reason: row.reason,
    };
  });

  const cashLines: CashLine[] = (cash.data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    orderId: row.order_id,
    memo: row.memo,
    createdAt: row.created_at,
  }));

  const latest: Record<string, LedgerQuote> = {};
  for (const row of quotes.data ?? []) {
    latest[row.instrument_id] = { instrumentId: row.instrument_id, price: row.price, asOf: row.as_of, source: row.source };
  }

  const book: LedgerBook = {
    registrationId: reg.id,
    studentId: reg.student_id,
    seasonId: season.id,
    seasonName: season.name,
    startingCapital: reg.starting_capital,
    cash: reg.cash,
    registeredAt: reg.registered_at,
    positions: (positions.data ?? []).map((row) => ({ instrumentId: row.instrument_id, quantity: row.quantity, costBasis: row.cost_basis })),
    orders: ledgerOrders,
    cashLines,
    quotes: latest,
    instruments: instruments.data ?? [],
  };
  return { status: "ready", book };
}
