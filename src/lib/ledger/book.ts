import Decimal from "decimal.js";
import type { LedgerBook, LedgerOrder } from "./types";

/** Mirrors public.ledger_reserve_collar() and public.ledger_simulation_cost_per_share(). */
export const RESERVE_COLLAR = "0.05";
export const SIMULATION_COST = "0.01";

/** Mirrors public.ledger_buy_reserve: quantity times price plus the collar, plus the simulation cost, rounded up to the cent. */
export function buyReserve(quantity: number, price: string): string {
  const raw = new Decimal(quantity).times(price).times(new Decimal(1).plus(RESERVE_COLLAR)).plus(new Decimal(quantity).times(SIMULATION_COST));
  return raw.times(100).ceil().dividedBy(100).toFixed(2);
}

export function heldReservations(orders: LedgerOrder[], kind: "cash" | "shares", instrumentId?: string): Decimal {
  return orders.reduce((sum, order) => {
    const reservation = order.reservation;
    if (!reservation || !reservation.held || reservation.kind !== kind) return sum;
    if (instrumentId && order.instrumentId !== instrumentId) return sum;
    return sum.plus(reservation.amount);
  }, new Decimal(0));
}

export type ValuedPosition = {
  instrumentId: string;
  name: string;
  sector: string;
  quantity: string;
  sharesReserved: string;
  costBasis: string;
  averageCost: string;
  price: string | null;
  priceAsOf: string | null;
  marketValue: string | null;
  unrealized: string | null;
  returnPct: string | null;
  weight: string | null;
};

export type BookValuation = {
  cash: string;
  reservedCash: string;
  availableCash: string;
  invested: string | null;
  equity: string | null;
  unrealized: string | null;
  realized: string;
  seasonReturn: string | null;
  positions: ValuedPosition[];
  missingQuotes: string[];
  quotesAsOf: string | null;
  quoteSources: string[];
};

/** Values the book at its stored quotes. A holding without a quote makes equity unavailable, never zero. */
export function valueLedgerBook(book: LedgerBook): BookValuation {
  const instruments = new Map(book.instruments.map((item) => [item.id, item]));
  const reservedCash = heldReservations(book.orders, "cash");
  const missing: string[] = [];
  const sources = new Set<string>();
  let invested = new Decimal(0);
  let latest: string | null = null;

  const rows = book.positions.map((position) => {
    const quote = book.quotes[position.instrumentId];
    const quantity = new Decimal(position.quantity);
    const basis = new Decimal(position.costBasis);
    const instrument = instruments.get(position.instrumentId);
    const base = {
      instrumentId: position.instrumentId,
      name: instrument?.name ?? position.instrumentId,
      sector: instrument?.sector ?? "Unknown",
      quantity: quantity.toString(),
      sharesReserved: heldReservations(book.orders, "shares", position.instrumentId).toString(),
      costBasis: basis.toFixed(2),
      averageCost: quantity.isZero() ? "0.00" : basis.dividedBy(quantity).toFixed(4),
    };
    if (!quote) {
      missing.push(position.instrumentId);
      return { ...base, value: null as Decimal | null, price: null, priceAsOf: null };
    }
    sources.add(quote.source);
    if (!latest || quote.asOf > latest) latest = quote.asOf;
    const value = quantity.times(quote.price);
    invested = invested.plus(value);
    return { ...base, value, price: new Decimal(quote.price).toFixed(2), priceAsOf: quote.asOf };
  });

  const cash = new Decimal(book.cash);
  const complete = missing.length === 0;
  const equity = complete ? cash.plus(invested) : null;
  const realized = book.orders.reduce((sum, order) => (order.execution?.realized ? sum.plus(order.execution.realized) : sum), new Decimal(0));
  const unrealized = complete
    ? rows.reduce((sum, row) => sum.plus(row.value ?? 0).minus(row.costBasis), new Decimal(0))
    : null;

  const positions: ValuedPosition[] = rows
    .map(({ value, ...row }) => ({
      ...row,
      marketValue: value ? value.toFixed(2) : null,
      unrealized: value ? value.minus(row.costBasis).toFixed(2) : null,
      returnPct: value && !new Decimal(row.costBasis).isZero() ? value.dividedBy(row.costBasis).minus(1).toFixed(6) : null,
      weight: value && equity && !equity.isZero() ? value.dividedBy(equity).toFixed(6) : null,
    }))
    .sort((a, b) => new Decimal(b.marketValue ?? 0).comparedTo(a.marketValue ?? 0));

  return {
    cash: cash.toFixed(2),
    reservedCash: reservedCash.toFixed(2),
    availableCash: cash.minus(reservedCash).toFixed(2),
    invested: complete ? invested.toFixed(2) : null,
    equity: equity ? equity.toFixed(2) : null,
    unrealized: unrealized ? unrealized.toFixed(2) : null,
    realized: realized.toFixed(2),
    seasonReturn: equity ? equity.dividedBy(book.startingCapital).minus(1).toFixed(6) : null,
    positions,
    missingQuotes: missing,
    quotesAsOf: latest,
    quoteSources: [...sources].sort(),
  };
}

export type Reconciliation = {
  cash: string;
  ledgerTotal: string;
  cashMatchesLedger: boolean;
  reservedCash: string;
  reservedShares: string;
  heldByClosedOrders: number;
  executions: number;
  filledOrders: number;
  ok: boolean;
};

/** Cash equals the sum of its ledger lines, closed orders hold nothing, and each fill has one execution. */
export function reconcileBook(book: LedgerBook): Reconciliation {
  const ledgerTotal = book.cashLines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  const heldByClosedOrders = book.orders.filter((order) => order.status !== "accepted" && order.reservation?.held).length;
  const executions = book.orders.filter((order) => order.execution).length;
  const filledOrders = book.orders.filter((order) => order.status === "filled").length;
  const cashMatchesLedger = ledgerTotal.equals(book.cash);
  return {
    cash: new Decimal(book.cash).toFixed(2),
    ledgerTotal: ledgerTotal.toFixed(2),
    cashMatchesLedger,
    reservedCash: heldReservations(book.orders, "cash").toFixed(2),
    reservedShares: heldReservations(book.orders, "shares").toString(),
    heldByClosedOrders,
    executions,
    filledOrders,
    ok: cashMatchesLedger && heldByClosedOrders === 0 && executions === filledOrders,
  };
}
