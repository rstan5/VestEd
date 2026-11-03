import Decimal from "decimal.js";
import { SIMULATION_COST_PER_SHARE } from "./costs";
import type {
  AcceptedOrder,
  FillOutcome,
  JobStore,
  OrderStatus,
  StoredQuote,
  ValuationSnapshot,
} from "./types";

export type FixturePosition = { instrumentId: string; quantity: string; cost: string };

export type FixtureAccount = {
  accountId: string;
  cash: string;
  reservedCash: string;
  positions: FixturePosition[];
};

export type FixtureOrder = AcceptedOrder & {
  status: OrderStatus;
  reservedCash: string;
  fillQuoteId?: string;
  fillPrice?: string;
  filledAt?: string;
  closedAt?: string;
  reason?: string;
};

export type FixtureRound = { id: string; endsAt: string; status: "open" | "final"; finalizedAt?: string };

export type FixtureSeed = {
  label: "sample";
  accounts: FixtureAccount[];
  orders: FixtureOrder[];
  quotes: StoredQuote[];
  rounds: FixtureRound[];
};

export type FixtureStore = JobStore & {
  label: "sample";
  order(id: string): FixtureOrder | undefined;
  account(id: string): FixtureAccount | undefined;
  round(id: string): FixtureRound | undefined;
  snapshots(): ValuationSnapshot[];
};

const money = (value: Decimal) => value.toFixed(2);

/** In-memory sample store for tests and local one-shot runs. It never touches a database or a vendor. */
export function createFixtureStore(seed: FixtureSeed): FixtureStore {
  const state = structuredClone(seed);
  const snapshots: ValuationSnapshot[] = [];

  const findOrder = (id: string) => state.orders.find((order) => order.id === id);
  const findAccount = (id: string) => state.accounts.find((account) => account.accountId === id);
  const releaseReserve = (account: FixtureAccount, order: FixtureOrder) => {
    account.reservedCash = money(new Decimal(account.reservedCash).minus(order.reservedCash));
  };
  const settle = (order: FixtureOrder, status: OrderStatus, at: string, reason?: string) => {
    const account = findAccount(order.accountId);
    if (account) releaseReserve(account, order);
    order.status = status;
    order.closedAt = at;
    order.reason = reason;
  };
  const reject = (order: FixtureOrder, at: string, reason: string): FillOutcome => {
    settle(order, "rejected", at, reason);
    return { status: "rejected", reason };
  };

  return {
    label: "sample",
    order: (id) => findOrder(id),
    account: (id) => findAccount(id),
    round: (id) => state.rounds.find((round) => round.id === id),
    snapshots: () => [...snapshots],

    async acceptedOrders() {
      return state.orders
        .filter((order) => order.status === "accepted")
        .map(({ id, accountId, instrumentId, side, quantity, acceptedAt }) => ({ id, accountId, instrumentId, side, quantity, acceptedAt }));
    },

    async firstQuoteAtOrAfter(instrumentId, at) {
      return (
        state.quotes
          .filter((quote) => quote.instrumentId === instrumentId && new Date(quote.asOf).getTime() >= at.getTime())
          .sort((a, b) => a.asOf.localeCompare(b.asOf))[0] ?? null
      );
    },

    async latestQuoteAtOrBefore(instrumentId, at) {
      return (
        state.quotes
          .filter((quote) => quote.instrumentId === instrumentId && new Date(quote.asOf).getTime() <= at.getTime())
          .sort((a, b) => b.asOf.localeCompare(a.asOf))[0] ?? null
      );
    },

    async fillOrder({ orderId, quoteId, price, filledAt }) {
      const order = findOrder(orderId);
      if (!order || order.status !== "accepted") return { status: "skipped", reason: "Order is not accepted." };
      const account = findAccount(order.accountId);
      if (!account) return reject(order, filledAt, "Account not found.");

      const quantity = new Decimal(order.quantity);
      const gross = quantity.times(price);
      const cost = quantity.times(SIMULATION_COST_PER_SHARE);
      const position = account.positions.find((item) => item.instrumentId === order.instrumentId);

      if (order.side === "buy") {
        const debit = gross.plus(cost);
        if (debit.greaterThan(order.reservedCash)) {
          return reject(order, filledAt, `Debit ${money(debit)} exceeds reserved cash ${order.reservedCash}.`);
        }
        account.cash = money(new Decimal(account.cash).minus(debit));
        if (position) {
          position.quantity = new Decimal(position.quantity).plus(quantity).toString();
          position.cost = new Decimal(position.cost).plus(debit).toString();
        } else {
          account.positions.push({ instrumentId: order.instrumentId, quantity: quantity.toString(), cost: money(debit) });
        }
      } else {
        if (!position || quantity.greaterThan(position.quantity)) {
          return reject(order, filledAt, "Sell quantity exceeds the open position.");
        }
        const held = new Decimal(position.quantity);
        const remaining = held.minus(quantity);
        account.cash = money(new Decimal(account.cash).plus(gross.minus(cost)));
        if (remaining.isZero()) {
          account.positions = account.positions.filter((item) => item !== position);
        } else {
          position.cost = new Decimal(position.cost).times(remaining).dividedBy(held).toString();
          position.quantity = remaining.toString();
        }
      }

      order.fillQuoteId = quoteId;
      order.fillPrice = price;
      order.filledAt = filledAt;
      settle(order, "filled", filledAt);
      return { status: "filled" };
    },

    async expireOrder(orderId, at) {
      const order = findOrder(orderId);
      if (!order || order.status !== "accepted") return false;
      settle(order, "expired", at.toISOString());
      return true;
    },

    async accountsToValue() {
      return state.accounts.map((account) => ({
        accountId: account.accountId,
        cash: account.cash,
        positions: account.positions.map(({ instrumentId, quantity }) => ({ instrumentId, quantity })),
      }));
    },

    async writeValuation(snapshot) {
      snapshots.push(snapshot);
    },

    async roundsDueForClose(at) {
      return state.rounds
        .filter((round) => round.status === "open" && new Date(round.endsAt).getTime() <= at.getTime())
        .map(({ id, endsAt }) => ({ id, endsAt }));
    },

    async finalizeRound(roundId, closedAt) {
      const round = state.rounds.find((item) => item.id === roundId);
      if (!round || round.status === "final") return "already-final";
      round.status = "final";
      round.finalizedAt = closedAt.toISOString();
      return "finalized";
    },
  };
}
