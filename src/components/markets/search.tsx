"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TYPE_FILTERS, type TypeFilter } from "@/lib/market/views";

function href(query: string, type: TypeFilter): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (type !== "all") params.set("type", type);
  const search = params.toString();
  return search ? `/markets?${search}` : "/markets";
}

/** Search runs on the server through the market adapter. Without JavaScript the form still submits as a GET. */
export function MarketSearch({ query, type, children }: { query: string; type: TypeFilter; children: React.ReactNode }) {
  const router = useRouter();
  const [text, setText] = useState(query);
  const [kind, setKind] = useState<TypeFilter>(type);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function go(nextText: string, nextKind: TypeFilter, delay: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(() => router.replace(href(nextText, nextKind), { scroll: false }));
    }, delay);
  }

  return (
    <div>
      <form
        role="search"
        action="/markets"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          go(text, kind, 0);
        }}
      >
        <label htmlFor="market-search" className="text-[12px] uppercase tracking-[0.08em] text-quiet">Search US stocks and ETFs</label>
        <div className="relative mt-2">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="market-search"
            name="q"
            type="search"
            className="v-field"
            style={{ padding: "12px 14px 12px 44px", fontSize: 16 }}
            placeholder="Ticker or company, for example AAPL or Vanguard"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              go(event.target.value, kind, 250);
            }}
          />
        </div>
        <input type="hidden" name="type" value={kind} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="v-segment" role="group" aria-label="Instrument type">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={kind === item.id}
                onClick={() => {
                  setKind(item.id);
                  go(text, item.id, 0);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-quiet" aria-live="polite">{pending ? "Searching…" : ""}</span>
        </div>
      </form>
      <div className="mt-6 transition-opacity motion-reduce:transition-none" style={{ opacity: pending ? 0.55 : 1 }} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}
