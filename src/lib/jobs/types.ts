import type { SessionClock } from "./clock";

export type OrderSide = "buy" | "sell";
export type OrderStatus = "accepted" | "filled" | "rejected" | "cancelled" | "expired";

export type AcceptedOrder = {
  id: string;
  accountId: string;
  instrumentId: string;
  side: OrderSide;
  quantity: number;
  acceptedAt: string;
};

export type StoredQuote = {
  id: string;
  instrumentId: string;
  price: string;
  asOf: string;
};

export type FillRequest = {
  orderId: string;
  quoteId: string;
  price: string;
  filledAt: string;
};

export type FillOutcome =
  | { status: "filled" }
  | { status: "rejected"; reason: string }
  | { status: "skipped"; reason: string };

export type AccountHoldings = {
  accountId: string;
  cash: string;
  positions: Array<{ instrumentId: string; quantity: string }>;
};

export type ValuationSnapshot = {
  accountId: string;
  valuedAt: string;
  status: "valued" | "unavailable";
  equity: string | null;
  missing: string[];
};

export type DueRound = { id: string; endsAt: string };

/** The ledger mutations behind each method must be atomic; the Postgres store implements them as SQL functions. */
export interface FillStore {
  acceptedOrders(): Promise<AcceptedOrder[]>;
  firstQuoteAtOrAfter(instrumentId: string, at: Date): Promise<StoredQuote | null>;
  fillOrder(request: FillRequest): Promise<FillOutcome>;
  expireOrder(orderId: string, at: Date): Promise<boolean>;
}

export interface ValuationStore {
  accountsToValue(): Promise<AccountHoldings[]>;
  latestQuoteAtOrBefore(instrumentId: string, at: Date): Promise<StoredQuote | null>;
  writeValuation(snapshot: ValuationSnapshot): Promise<void>;
}

export interface RoundStore {
  roundsDueForClose(at: Date): Promise<DueRound[]>;
  finalizeRound(roundId: string, closedAt: Date): Promise<"finalized" | "already-final">;
}

export type JobStore = FillStore & ValuationStore & RoundStore;

export type JobContext<S = JobStore> = {
  store: S;
  clock: SessionClock;
  now: Date;
};
