"use client";

import { useState } from "react";
import type { Security } from "@/lib/domain";
import { money } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";

export function OrderTicket({ security }: { security: Security }) {
  const { book, submitOrder } = usePortfolio();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shares = Number(quantity);
  const estimate = Number.isFinite(shares) ? shares * (side === "buy" ? security.price + 0.01 : Math.max(security.price - 0.01, 0.01)) : 0;
  const owned = book.positions.find((position) => position.ticker === security.ticker)?.quantity ?? 0;

  function review() {
    setError(null);
    setMessage(null);
    if (!Number.isInteger(shares) || shares <= 0) {
      setError("Enter a positive whole number of shares.");
      return;
    }
    setConfirming(true);
  }

  function confirm() {
    const result = submitOrder(security.ticker, side, shares);
    setConfirming(false);
    if (!result.accepted) {
      setError(result.order.reason);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(`${side === "buy" ? "Bought" : "Sold"} ${shares} ${security.ticker} at ${money(result.order.fillPrice ?? 0)}. ${result.order.reason}`);
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="serif text-xl text-forest">Simulated order</h3>
        <span className="pill">Sample fill</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">
        Market orders only. The fill uses the sample quote plus or minus one cent, not the displayed price as a free execution. No margin, shorts, options, or crypto.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((item) => (
          <button key={item} type="button" className={side === item ? "btn" : "btn secondary"} onClick={() => { setSide(item); setConfirming(false); }}>
            {item === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-xs uppercase tracking-[0.08em] text-muted" htmlFor="qty">Quantity</label>
      <input id="qty" className="field mt-1" inputMode="numeric" value={quantity} onChange={(event) => { setQuantity(event.target.value); setConfirming(false); }} />
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Sample quote" value={money(security.price)} />
        <Row label="Owned" value={`${owned} sh`} />
        <Row label="Cash" value={money(book.cash)} />
        <Row label={side === "buy" ? "Estimated debit" : "Estimated credit"} value={money(estimate)} />
      </dl>
      {error ? <p className="mt-3 text-sm text-loss" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-forest" role="status">{message}</p> : null}
      {confirming ? (
        <div className="mt-4 rounded-lg border border-pale bg-mint p-3 text-sm">
          <p>Confirm {side} {shares} {security.ticker}. This updates only the demo ledger in this browser.</p>
          <div className="mt-3 flex gap-2">
            <button className="btn" type="button" onClick={confirm}>Confirm fill</button>
            <button className="btn secondary" type="button" onClick={() => setConfirming(false)}>Back</button>
          </div>
        </div>
      ) : (
        <button className="btn mt-4 w-full" type="button" onClick={review}>Review order</button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mono text-forest">{value}</dd>
    </div>
  );
}
