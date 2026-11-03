export type LedgerSide = "buy" | "sell";
export type LedgerOrderStatus = "accepted" | "filled" | "rejected" | "cancelled" | "expired";
export type CashLineKind = "opening" | "trade" | "simulation_cost";

export type LedgerReservation = {
  kind: "cash" | "shares";
  amount: string;
  held: boolean;
  releasedAt: string | null;
  releaseReason: string | null;
};

export type LedgerExecution = {
  id: string;
  orderId: string;
  quoteId: string;
  price: string;
  gross: string;
  simulationCost: string;
  netCash: string;
  realized: string | null;
  executedAt: string;
};

export type LedgerOrder = {
  id: string;
  studentId: string;
  instrumentId: string;
  side: LedgerSide;
  quantity: number;
  status: LedgerOrderStatus;
  idempotencyKey: string;
  acceptedAt: string;
  eligibleAt: string;
  expiresAt: string;
  referencePrice: string | null;
  reservation: LedgerReservation | null;
  execution: LedgerExecution | null;
  closedAt: string | null;
  reason: string | null;
};

export type LedgerPosition = { instrumentId: string; quantity: string; costBasis: string };

export type CashLine = {
  id: number;
  kind: CashLineKind;
  amount: string;
  orderId: string | null;
  memo: string;
  createdAt: string;
};

export type LedgerQuote = { instrumentId: string; price: string; asOf: string; source: "sample" | "licensed" };

export type LedgerInstrument = { id: string; name: string; kind: string; sector: string | null };

export type LedgerBook = {
  registrationId: string;
  studentId: string;
  seasonId: string;
  seasonName: string;
  startingCapital: string;
  cash: string;
  registeredAt: string;
  positions: LedgerPosition[];
  orders: LedgerOrder[];
  cashLines: CashLine[];
  quotes: Record<string, LedgerQuote>;
  instruments: LedgerInstrument[];
};

export type LedgerState =
  | { status: "ready"; book: LedgerBook }
  | { status: "signed-out" }
  | { status: "unavailable"; message: string };

/** The order payload returned by the ledger RPCs. Money and prices are decimal strings. */
export type OrderPayload = {
  id: string;
  student_id: string;
  registration_id: string;
  season_id: string;
  instrument_id: string;
  side: LedgerSide;
  quantity: number;
  time_in_force: "day";
  idempotency_key: string;
  status: LedgerOrderStatus;
  accepted_at: string;
  eligible_at: string;
  expires_at: string;
  reference_quote_id: string | null;
  reference_price: string | null;
  reservation: { kind: "cash" | "shares"; amount: string; held: boolean; released_at: string | null; release_reason: string | null } | null;
  execution: {
    id: string;
    quote_id: string;
    price: string;
    gross: string;
    simulation_cost: string;
    net_cash: string;
    executed_at: string;
  } | null;
  closed_at: string | null;
  reason: string | null;
  replayed: boolean;
};

export function fromOrderPayload(payload: OrderPayload): LedgerOrder & { replayed: boolean } {
  return {
    id: payload.id,
    studentId: payload.student_id,
    instrumentId: payload.instrument_id,
    side: payload.side,
    quantity: payload.quantity,
    status: payload.status,
    idempotencyKey: payload.idempotency_key,
    acceptedAt: payload.accepted_at,
    eligibleAt: payload.eligible_at,
    expiresAt: payload.expires_at,
    referencePrice: payload.reference_price,
    reservation: payload.reservation
      ? {
          kind: payload.reservation.kind,
          amount: payload.reservation.amount,
          held: payload.reservation.held,
          releasedAt: payload.reservation.released_at,
          releaseReason: payload.reservation.release_reason,
        }
      : null,
    execution: payload.execution
      ? {
          id: payload.execution.id,
          orderId: payload.id,
          quoteId: payload.execution.quote_id,
          price: payload.execution.price,
          gross: payload.execution.gross,
          simulationCost: payload.execution.simulation_cost,
          netCash: payload.execution.net_cash,
          realized: null,
          executedAt: payload.execution.executed_at,
        }
      : null,
    closedAt: payload.closed_at,
    reason: payload.reason,
    replayed: payload.replayed,
  };
}
