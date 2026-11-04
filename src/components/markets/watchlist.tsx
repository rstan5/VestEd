"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { StatusNote, Tag } from "@/components/ui";
import { money, percent, tone } from "@/lib/format";
import type { MarketRow } from "@/lib/market/views";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist/client";
import type { WatchlistState } from "@/lib/watchlist/types";

type Notice = { kind: "success" | "error"; text: string };

type Store = {
  state: WatchlistState;
  pending: string | null;
  notice: Notice | null;
  toggle: (ticker: string) => Promise<void>;
};

const WatchlistContext = createContext<Store | null>(null);

/** Holds the signed-in student's saved watchlist. Every change is written to the server before it shows here. */
export function WatchlistProvider({ initial, children }: { initial: WatchlistState; children: React.ReactNode }) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function toggle(ticker: string) {
    if (state.status !== "ready" || pending) return;
    const watched = state.tickers.includes(ticker);
    setPending(ticker);
    setNotice(null);
    const result = watched ? await removeFromWatchlist(ticker) : await addToWatchlist(ticker);
    setPending(null);
    if (result.ok) {
      setState({ status: "ready", tickers: result.tickers });
      setNotice({ kind: "success", text: watched ? `${ticker} removed from your watchlist.` : `${ticker} saved to your watchlist.` });
      return;
    }
    if (result.signedOut) setState({ status: "signed-out" });
    setNotice({ kind: "error", text: result.message });
  }

  return <WatchlistContext.Provider value={{ state, pending, notice, toggle }}>{children}</WatchlistContext.Provider>;
}

function useWatchlist(): Store {
  const store = useContext(WatchlistContext);
  if (!store) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return store;
}

export function WatchButton({ ticker, next, size = "small" }: { ticker: string; next: string; size?: "small" | "regular" }) {
  const { state, pending, toggle } = useWatchlist();
  const sizeClass = size === "small" ? "v-btn quiet small" : "v-btn quiet";
  if (state.status === "signed-out") {
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className={sizeClass} aria-label={`Sign in to watch ${ticker}`}>
        <StarIcon filled={false} />
        <span className={size === "small" ? "hidden sm:inline" : undefined}>Watch</span>
      </Link>
    );
  }
  if (state.status === "error") {
    return (
      <button type="button" className={sizeClass} disabled aria-label={`Watchlist unavailable for ${ticker}`}>
        <StarIcon filled={false} />
        <span className={size === "small" ? "hidden sm:inline" : undefined}>Watch</span>
      </button>
    );
  }
  const watched = state.tickers.includes(ticker);
  const busy = pending === ticker;
  return (
    <button
      type="button"
      className={sizeClass}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      disabled={pending !== null}
      onClick={() => void toggle(ticker)}
      data-testid={`watch-${ticker}`}
    >
      <StarIcon filled={watched} />
      <span className={size === "small" ? "hidden sm:inline" : undefined}>{busy ? "Saving…" : watched ? "Watching" : "Watch"}</span>
    </button>
  );
}

export function WatchlistNotice() {
  const { notice } = useWatchlist();
  return (
    <div aria-live="polite" className="min-h-0">
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "mt-3 rounded-xl border border-[#efd2cc] bg-loss-soft px-4 py-2.5 text-sm text-loss" : "mt-3 text-sm text-forest"}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

export function WatchlistPanel({ directory }: { directory: Record<string, MarketRow> }) {
  const { state, pending, toggle } = useWatchlist();
  return (
    <div data-testid="watchlist">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="watchlist-heading" className="serif text-2xl text-forest">Your watchlist</h2>
        {state.status === "ready" ? <span className="mono text-[13px] text-quiet">{state.tickers.length}</span> : null}
      </div>
      <p className="mt-1 text-[13px] leading-5 text-quiet">Saved to your account. Prices beside each symbol are sample quotes.</p>
      <div className="mt-4">
        {state.status === "signed-out" ? (
          <StatusNote
            kind="empty"
            compact
            title="Sign in to keep a watchlist"
            body="Your watchlist is saved to your account, so it follows you between visits and devices."
            action={<Link href="/login?next=%2Fmarkets" className="v-btn quiet small">Sign in</Link>}
          />
        ) : state.status === "error" ? (
          <StatusNote kind="error" compact title="Watchlist unavailable" body={state.message} />
        ) : state.tickers.length === 0 ? (
          <StatusNote kind="empty" compact title="Nothing watched yet" body="Use Watch on any stock or ETF to save it here." />
        ) : (
          <ul className="divide-y divide-rule border-y border-rule" aria-label="Watched symbols">
            {state.tickers.map((ticker) => {
              const row = directory[ticker];
              const quote = row?.quote.status === "sample" ? row.quote.data : null;
              const ratio = quote && Number(quote.previousClose) > 0 ? Number(quote.change) / Number(quote.previousClose) : null;
              return (
                <li key={ticker} className="flex items-center gap-3 py-3">
                  <Link href={`/markets/${ticker}`} className="min-w-0 flex-1 rounded-lg hover:bg-wash">
                    <span className="mono text-[15px] text-deep">{ticker}</span>
                    <span className="block truncate text-[12px] text-quiet">{row?.listing?.name ?? "Listing unavailable"}</span>
                  </Link>
                  <span className="text-right">
                    <span className="mono block text-[14px] text-forest">{quote ? money(Number(quote.price)) : "Unavailable"}</span>
                    <span className={`mono block text-[12px] ${ratio === null ? "text-quiet" : tone(ratio)}`}>{ratio === null ? "Sample quote unavailable" : percent(ratio, 2)}</span>
                  </span>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-rule text-quiet hover:border-sage hover:text-forest disabled:opacity-45"
                    aria-label={`Remove ${ticker} from watchlist`}
                    disabled={pending !== null}
                    onClick={() => void toggle(ticker)}
                  >
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {state.status === "ready" && state.tickers.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-quiet"><Tag kind="sample">Sample quotes</Tag> No vendor or quote time.</p>
      ) : null}
      <WatchlistNotice />
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
