"use client";

import { useEffect, useRef } from "react";
import { Tag } from "@/components/ui";
import { dateTime, money, percent, plainPercent } from "@/lib/format";
import { DEMONSTRATION_LABEL, type ModelStatus } from "@/lib/model/status";
import type { ContextPack, PortfolioContext } from "@/lib/professor/types";

export function portfolioTag(portfolio: PortfolioContext) {
  if (portfolio.status === "ready") return <Tag kind="provisional">Using your book</Tag>;
  if (portfolio.status === "not-registered") return <Tag>No book yet</Tag>;
  return <Tag kind="unavailable">Book unavailable</Tag>;
}

export function ContextDrawer({ context, model, onClose }: { context: ContextPack; model: ModelStatus; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

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
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex='0']"));
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

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <div className="v-scrim absolute inset-0 bg-[#10261c]/25" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-drawer-title"
        className="v-sheet absolute inset-0 flex flex-col bg-paper md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:border-l md:border-rule md:shadow-[-20px_0_40px_rgba(16,59,43,0.06)]"
        data-testid="context-drawer"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule px-6 py-4">
          <h2 id="context-drawer-title" className="serif text-2xl text-forest">Context</h2>
          <button type="button" className="v-btn quiet small" onClick={onClose} data-autofocus>Close</button>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6 text-sm">
          <p className="leading-6 text-quiet">
            What the Professor is given for your questions. It is read on the server with your own sign-in, for {context.displayName} only.
          </p>
          <PortfolioSection context={context} />
          <WatchlistSection context={context} />
          <section aria-labelledby="ctx-public">
            <div className="flex items-center justify-between gap-3">
              <h3 id="ctx-public" className="font-medium text-forest">Public information</h3>
              <Tag>Competition rules</Tag>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-6 text-ink">
              {context.public.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-quiet">
              <Tag kind="unavailable">Unavailable</Tag> S&amp;P 500 total-return benchmark, until a licensed series exists.
            </p>
          </section>
          <section aria-labelledby="ctx-never">
            <h3 id="ctx-never" className="font-medium text-forest">Never included</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-6 text-ink">
              <li>Another student&apos;s holdings, orders, or cash.</li>
              <li>Live or delayed quotes, and live news.</li>
              <li>Any way to place, fill, or cancel an order.</li>
            </ul>
          </section>
          <section aria-labelledby="ctx-model">
            <h3 id="ctx-model" className="font-medium text-forest">Replies</h3>
            <p className="mt-2 flex flex-wrap items-center gap-2 leading-6 text-quiet">
              {model === "demonstration" ? <Tag kind="sample">{DEMONSTRATION_LABEL}</Tag> : <Tag kind="unavailable">Model unavailable</Tag>}
              <span>No model provider is called in this build.</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function PortfolioSection({ context }: { context: ContextPack }) {
  const portfolio = context.portfolio;
  return (
    <section aria-labelledby="ctx-book" data-testid="context-portfolio" data-status={portfolio.status}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="ctx-book" className="font-medium text-forest">Your book</h3>
        {portfolioTag(portfolio)}
      </div>
      <p className="mt-1 text-[13px] text-quiet">Read from the server ledger {dateTime(context.readAt)} ET.</p>
      {portfolio.status !== "ready" ? (
        <p className="mt-3 leading-6 text-ink">{portfolio.message}</p>
      ) : (
        <>
          <dl className="mt-3 divide-y divide-rule border-y border-rule">
            <Row label="Season" value={portfolio.seasonName} />
            <Row label="Equity" value={portfolio.equity === null ? "Unavailable" : money(Number(portfolio.equity))} />
            <Row label="Cash" value={money(Number(portfolio.cash))} />
            <Row label="Season return" value={portfolio.seasonReturn === null ? "Unavailable" : percent(Number(portfolio.seasonReturn), 2)} />
            <Row label="Open orders" value={String(portfolio.openOrders)} />
          </dl>
          {portfolio.holdings.length === 0 ? (
            <p className="mt-3 leading-6 text-quiet">No holdings. The book is all cash.</p>
          ) : (
            <ul className="mt-3 space-y-1.5" aria-label="Holdings in context">
              {portfolio.holdings.map((holding) => (
                <li key={holding.ticker} className="flex justify-between gap-4">
                  <span>
                    <span className="mono text-deep">{holding.ticker}</span> <span className="text-quiet">{holding.quantity} sh · {holding.sector}</span>
                  </span>
                  <span className="mono text-forest">{holding.weight === null ? "Unpriced" : plainPercent(Number(holding.weight))}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] leading-5 text-quiet" data-testid="context-freshness">
            {portfolio.missingQuotes.length > 0 ? (
              <>
                <Tag kind="unavailable">Prices unavailable</Tag>
                <span>No stored quote for {portfolio.missingQuotes.join(", ")}, so equity is unavailable.</span>
              </>
            ) : portfolio.quotesAsOf ? (
              <>
                <Tag kind="sample">{portfolio.quoteSources.includes("licensed") ? "Stored quotes" : "Sample quotes"}</Tag>
                <span>Latest stored quote {dateTime(portfolio.quotesAsOf)} ET. Not live or delayed vendor data.</span>
              </>
            ) : (
              <span>No holdings to price.</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}

function WatchlistSection({ context }: { context: ContextPack }) {
  const watchlist = context.watchlist;
  return (
    <section aria-labelledby="ctx-watch" data-testid="context-watchlist">
      <div className="flex items-center justify-between gap-3">
        <h3 id="ctx-watch" className="font-medium text-forest">Your watchlist</h3>
        {watchlist.status === "ready" ? <Tag>Saved on the server</Tag> : <Tag kind="unavailable">Unavailable</Tag>}
      </div>
      <p className="mt-3 leading-6 text-ink">
        {watchlist.status !== "ready"
          ? watchlist.message
          : watchlist.tickers.length === 0
            ? "Empty. Add symbols from Markets."
            : <span className="mono">{watchlist.tickers.join(", ")}</span>}
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-quiet">{label}</dt>
      <dd className="mono text-right text-forest">{value}</dd>
    </div>
  );
}
