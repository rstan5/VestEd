"use client";

import { useMemo, useState } from "react";
import { EmptyState, Pill } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import { headlines } from "@/lib/sample-data";

export default function ResearchPage() {
  const { book, watchlist } = usePortfolio();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const holdingTickers = book.positions.map((position) => position.ticker);
  const rows = useMemo(() => {
    return headlines.filter((item) => {
      const text = `${item.title} ${item.summary} ${item.tickers.join(" ")}`.toLowerCase();
      if (!text.includes(query.toLowerCase().trim())) return false;
      if (filter === "holdings") return item.tickers.some((ticker) => holdingTickers.includes(ticker));
      if (filter === "watchlist") return item.tickers.some((ticker) => watchlist.includes(ticker));
      if (filter === "market") return item.relevance === "market";
      return true;
    });
  }, [filter, query, holdingTickers, watchlist]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Research</div>
          <h1 className="serif text-4xl text-forest">News desk</h1>
        </div>
        <Pill tone="warn">Sample headlines, not a live wire</Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All sample"],
          ["holdings", "Holdings"],
          ["watchlist", "Watchlist"],
          ["market", "Market"],
        ].map(([id, label]) => (
          <button key={id} className={filter === id ? "btn" : "btn secondary"} type="button" onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sample briefs" aria-label="Search news" />
      {rows.length === 0 ? <EmptyState title="No sample briefs" body="Nothing in the curated set matches that filter. This is not a live search of publishers." /> : (
        <div className="grid gap-3">
          {rows.map((item) => (
            <article key={item.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{item.publisher}</span>
                <span>{shortDate(item.publishedAt)}</span>
                <Pill>{item.relevance}</Pill>
              </div>
              <h2 className="serif mt-2 text-2xl text-forest">{item.title}</h2>
              <p className="mt-2 text-sm leading-6">{item.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="mono text-muted">{item.tickers.join(" · ")}</span>
                <a className="text-primary" href={item.url}>Source link</a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
