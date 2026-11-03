import Decimal from "decimal.js";
import type { JobContext, ValuationSnapshot, ValuationStore } from "./types";

export type ValuationJobResult = { snapshots: ValuationSnapshot[] };

/** A holding without a stored quote makes the snapshot unavailable rather than valuing it at zero. */
export async function valueAccounts({ store, now }: JobContext<ValuationStore>): Promise<ValuationJobResult> {
  const snapshots: ValuationSnapshot[] = [];
  for (const account of await store.accountsToValue()) {
    let equity = new Decimal(account.cash);
    const missing: string[] = [];
    for (const position of account.positions) {
      const quote = await store.latestQuoteAtOrBefore(position.instrumentId, now);
      if (!quote) {
        missing.push(position.instrumentId);
        continue;
      }
      equity = equity.plus(new Decimal(position.quantity).times(quote.price));
    }
    const snapshot: ValuationSnapshot = {
      accountId: account.accountId,
      valuedAt: now.toISOString(),
      status: missing.length === 0 ? "valued" : "unavailable",
      equity: missing.length === 0 ? equity.toFixed(2) : null,
      missing,
    };
    await store.writeValuation(snapshot);
    snapshots.push(snapshot);
  }
  return { snapshots };
}
