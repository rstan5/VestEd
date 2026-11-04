"use client";

import { useCallback, useState } from "react";
import { TradeSheet } from "@/components/ticket";
import { usePortfolio } from "@/lib/portfolio-state";
import { WatchButton, WatchlistNotice } from "./watchlist";

/** Watch and trade controls for one symbol. Trades go to the signed-in student's server book. */
export function SecurityActions({ ticker, tradable }: { ticker: string; tradable: boolean }) {
  const { student } = usePortfolio();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const held = student.status === "ready" ? student.valuation.positions.find((position) => position.instrumentId === ticker) ?? null : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <WatchButton ticker={ticker} next={`/markets/${ticker}`} size="regular" />
        {tradable ? (
          <button type="button" className="v-btn" onClick={() => setOpen(true)}>Trade {ticker}</button>
        ) : null}
        {student.status === "ready" ? (
          <span className="text-sm text-quiet" data-testid="position-line">
            {held && Number(held.quantity) > 0 ? <>You hold <span className="mono text-forest">{held.quantity}</span> shares</> : "Not in your book"}
          </span>
        ) : null}
      </div>
      <WatchlistNotice />
      {open ? <TradeSheet initialTicker={ticker} onClose={close} /> : null}
    </div>
  );
}
