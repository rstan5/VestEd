"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Security } from "@/lib/domain";
import { dateTime, money } from "@/lib/format";
import { buyReserve, SIMULATION_COST } from "@/lib/ledger/book";
import type { OrderPayload } from "@/lib/ledger/types";
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

type SheetStep = "edit" | "review" | "done";

function newOrderKey(): string {
  return `web-${crypto.randomUUID()}`;
}

/** Places an order on the signed-in student's server book. The fill never comes from this screen. */
export function TradeSheet({ initialTicker, onClose }: { initialTicker: string; onClose: () => void }) {
  const { student, placeServerOrder } = usePortfolio();
  const [ticker, setTicker] = useState(initialTicker);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  const [step, setStep] = useState<SheetStep>("edit");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newOrderKey);
  const [receipt, setReceipt] = useState<OrderPayload | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const ready = student.status === "ready" ? student : null;
  const instrument = ready?.book.instruments.find((item) => item.id === ticker) ?? ready?.book.instruments[0] ?? null;
  const activeTicker = instrument?.id ?? ticker;
  const quote = ready?.book.quotes[activeTicker] ?? null;
  const shares = Number(quantity);
  const held = ready?.valuation.positions.find((position) => position.instrumentId === activeTicker) ?? null;
  const owned = held ? Number(held.quantity) : 0;
  const heldShares = held ? Number(held.sharesReserved) : 0;
  const availableCash = ready ? Number(ready.valuation.availableCash) : null;

  const estimate = (() => {
    if (!ready || !quote || !Number.isInteger(shares) || shares <= 0) return null;
    if (side === "buy") return buyReserve(shares, quote.price);
    return new Decimal(shares).times(quote.price).minus(new Decimal(shares).times(SIMULATION_COST)).toFixed(2);
  })();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  function edit(update: () => void) {
    update();
    setStep("edit");
    setError(null);
  }

  function review() {
    setError(null);
    if (!instrument) {
      setError("No tradable stocks or ETFs are listed right now.");
      return;
    }
    if (!Number.isInteger(shares) || shares <= 0) {
      setError("Enter a positive whole number of shares.");
      return;
    }
    if (side === "buy" && !quote) {
      setError(`No stored quote for ${activeTicker}, so a buy cannot be reserved.`);
      return;
    }
    setIdempotencyKey(newOrderKey());
    setStep("review");
  }

  async function confirm() {
    setSubmitting(true);
    setError(null);
    const result = await placeServerOrder({ instrument: activeTicker, side, quantity: shares, idempotencyKey });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      setStep("edit");
      return;
    }
    setReceipt(result.order);
    setStep("done");
  }

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <div className="v-scrim absolute inset-0 bg-[#10261c]/25" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-sheet-title"
        className="v-sheet absolute inset-0 flex flex-col bg-paper md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:border-l md:border-rule md:shadow-[-20px_0_40px_rgba(16,59,43,0.06)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 id="trade-sheet-title" className="serif text-2xl text-forest">Trade</h2>
            <span className="v-tag" data-kind="sample">Sample quotes</span>
          </div>
          <button type="button" className="v-btn quiet small" onClick={onClose} data-autofocus>Close</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!ready ? (
            <div role="status" className="rounded-2xl border border-pale bg-wash p-5">
              {student.status === "loading" ? (
                <p className="text-sm leading-6 text-quiet">Loading your book…</p>
              ) : student.status === "unavailable" ? (
                <>
                  <p className="serif text-xl text-forest">Your book is unavailable</p>
                  <p className="mt-2 text-sm leading-6 text-quiet">{student.message}</p>
                </>
              ) : (
                <>
                  <p className="serif text-xl text-forest">Sign in to trade</p>
                  <p className="mt-2 text-sm leading-6 text-quiet">Orders are placed on your own server book, not this browser&apos;s sample demo.</p>
                  <Link href="/login" className="v-btn mt-4 w-full" onClick={onClose}>Sign in</Link>
                </>
              )}
            </div>
          ) : step === "done" && receipt ? (
            <div role="status" className="rounded-2xl border border-pale bg-wash p-5">
              <span className="v-tag" data-kind="provisional">{receipt.replayed ? "Already placed" : "Accepted"}</span>
              <p className="serif mt-3 text-xl text-forest capitalize">{receipt.side} {receipt.quantity} {receipt.instrument_id}</p>
              <p className="mt-2 text-sm leading-6 text-quiet">
                {receipt.replayed
                  ? "This exact order was already accepted under the same key, so nothing was placed twice."
                  : `Queued until ${dateTime(receipt.eligible_at)}. It fills on the first stored sample quote at or after eligibility and expires at ${dateTime(receipt.expires_at)} if none arrives. Cancel it from the Orders tab before it fills.`}
              </p>
            </div>
          ) : step === "review" && instrument ? (
            <div>
              <p className="text-[12px] uppercase tracking-[0.08em] text-quiet">Review</p>
              <p className="serif mt-2 text-3xl text-forest">{side === "buy" ? "Buy" : "Sell"} {shares} {activeTicker}</p>
              <dl className="mt-6 divide-y divide-rule border-y border-rule text-sm">
                <SheetRow label="Symbol" value={`${instrument.id} · ${instrument.name}`} />
                <SheetRow label="Shares" value={String(shares)} />
                <SheetRow label="Stored quote (sample)" value={quote ? `${money(Number(quote.price))} · ${dateTime(quote.asOf)}` : "Unavailable"} />
                <SheetRow label={side === "buy" ? "Estimated reserve" : "Estimated credit"} value={estimate === null ? "Unavailable" : money(Number(estimate))} />
              </dl>
              <p className="mt-5 text-[13px] leading-6 text-quiet">
                Execution rule: the server ledger {side === "buy" ? "reserves the estimate plus a five percent collar" : "reserves the shares"} now and fills on the first stored quote at or after eligibility
                (acceptance plus 15 minutes, never before the next regular open). Simulation cost is $0.01 per share. The stored quote, not this estimate, sets the fill.
              </p>
            </div>
          ) : (
            <form id="trade-form" onSubmit={(event) => { event.preventDefault(); review(); }} className="space-y-6">
              <div>
                <label htmlFor="trade-symbol" className="text-[12px] uppercase tracking-[0.08em] text-quiet">Symbol</label>
                <select id="trade-symbol" className="v-field mt-2" value={activeTicker} onChange={(event) => edit(() => setTicker(event.target.value))}>
                  {ready.book.instruments.map((item) => (
                    <option key={item.id} value={item.id}>{item.id} · {item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <span id="trade-side" className="text-[12px] uppercase tracking-[0.08em] text-quiet">Side</span>
                <div className="v-segment mt-2 w-full" role="group" aria-labelledby="trade-side">
                  {(["buy", "sell"] as const).map((item) => (
                    <button key={item} type="button" className="flex-1" aria-pressed={side === item} onClick={() => edit(() => setSide(item))}>
                      {item === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="trade-qty" className="text-[12px] uppercase tracking-[0.08em] text-quiet">Shares</label>
                <input id="trade-qty" className="v-field mono mt-2 text-lg" inputMode="numeric" value={quantity} onChange={(event) => edit(() => setQuantity(event.target.value))} aria-describedby="trade-qty-hint" />
                <p id="trade-qty-hint" className="mt-1.5 text-[13px] text-quiet">Whole shares only. Long positions only, no margin or options.</p>
              </div>
              <dl className="divide-y divide-rule border-y border-rule text-sm">
                <SheetRow label="Stored quote (sample)" value={quote ? money(Number(quote.price)) : "Unavailable"} />
                <SheetRow label="You own" value={`${owned} sh${heldShares > 0 ? ` (${heldShares} reserved)` : ""}`} />
                <SheetRow label="Cash available" value={availableCash === null ? "Unavailable" : money(availableCash)} />
                <SheetRow label={side === "buy" ? "Estimated reserve" : "Estimated credit"} value={estimate === null ? "Unavailable" : money(Number(estimate))} />
              </dl>
              {error ? (
                <div role="alert" className="rounded-xl border border-[#efd2cc] bg-loss-soft px-4 py-3 text-sm text-loss">
                  <span className="font-medium">Order not placed.</span> {error}
                </div>
              ) : null}
            </form>
          )}
        </div>

        <div className="flex gap-3 border-t border-rule px-6 py-4">
          {!ready ? (
            <button type="button" className="v-btn flex-1" onClick={onClose}>Close</button>
          ) : step === "done" ? (
            <>
              <button type="button" className="v-btn flex-1" onClick={onClose}>Done</button>
              <button type="button" className="v-btn quiet" onClick={() => { setReceipt(null); setStep("edit"); }}>Place another</button>
            </>
          ) : step === "review" ? (
            <>
              <button type="button" className="v-btn flex-1" disabled={submitting} onClick={() => void confirm()}>{submitting ? "Placing…" : `Confirm ${side}`}</button>
              <button type="button" className="v-btn quiet" disabled={submitting} onClick={() => setStep("edit")}>Back</button>
            </>
          ) : (
            <>
              <button type="submit" form="trade-form" className="v-btn flex-1">Review order</button>
              <button type="button" className="v-btn quiet" onClick={onClose}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-quiet">{label}</dt>
      <dd className="mono text-right text-forest">{value}</dd>
    </div>
  );
}
