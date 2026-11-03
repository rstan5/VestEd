import { eligibleAt } from "./clock";
import type { FillStore, JobContext } from "./types";

export type FillJobResult = {
  filled: Array<{ orderId: string; quoteId: string; price: string; filledAt: string }>;
  rejected: Array<{ orderId: string; reason: string }>;
  expired: string[];
  waiting: string[];
  skipped: Array<{ orderId: string; reason: string }>;
};

/** One pass over accepted orders. Safe to call from a test, a local timer, or a hosted scheduled job. */
export async function fillEligibleOrders({ store, clock, now }: JobContext<FillStore>): Promise<FillJobResult> {
  const result: FillJobResult = { filled: [], rejected: [], expired: [], waiting: [], skipped: [] };

  for (const order of await store.acceptedOrders()) {
    const { eligibleAt: eligible, session } = eligibleAt(order.acceptedAt, clock);
    if (now.getTime() < eligible.getTime()) {
      result.waiting.push(order.id);
      continue;
    }

    const quote = await store.firstQuoteAtOrAfter(order.instrumentId, eligible);
    const quoteTime = quote ? new Date(quote.asOf).getTime() : Number.POSITIVE_INFINITY;
    if (quote && quoteTime < session.close.getTime() && quoteTime <= now.getTime()) {
      const outcome = await store.fillOrder({ orderId: order.id, quoteId: quote.id, price: quote.price, filledAt: quote.asOf });
      if (outcome.status === "filled") {
        result.filled.push({ orderId: order.id, quoteId: quote.id, price: quote.price, filledAt: quote.asOf });
      } else if (outcome.status === "rejected") {
        result.rejected.push({ orderId: order.id, reason: outcome.reason });
      } else {
        result.skipped.push({ orderId: order.id, reason: outcome.reason });
      }
      continue;
    }

    if (now.getTime() >= session.close.getTime()) {
      if (await store.expireOrder(order.id, session.close)) result.expired.push(order.id);
      else result.skipped.push({ orderId: order.id, reason: "Order was no longer accepted." });
      continue;
    }

    result.waiting.push(order.id);
  }

  return result;
}
