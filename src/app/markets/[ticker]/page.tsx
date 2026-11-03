"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LineChart } from "@/components/chart";
import { OrderTicket } from "@/components/ticket";
import { EmptyState, Pill } from "@/components/ui";
import { compactMoney, money, number, percent, shortDate } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import { headlines, securities } from "@/lib/sample-data";

const periods = [
  { id: "1M", points: 22 },
  { id: "3M", points: 66 },
  { id: "Season", points: 90 },
];

export default function SecurityPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = params.ticker?.toUpperCase();
  const security = securities.find((item) => item.ticker === ticker);
  const { book, watchlist, toggleWatch } = usePortfolio();
  const [period, setPeriod] = useState("3M");
  const chart = useMemo(() => {
    if (!security) return [];
    const count = periods.find((item) => item.id === period)?.points ?? 66;
    let price = security.price / 1.08;
    return Array.from({ length: count }, (_, index) => {
      price *= 1 + Math.sin(index / 5) * 0.004 + 0.0006;
      return { label: String(index), value: index === count - 1 ? security.price : price, benchmark: security.price * 0.96 };
    });
  }, [security, period]);

  if (!security) {
    return <EmptyState title="Security not in the sample universe" body="This prototype trades a fixed list of US stocks and ETFs. Search Markets for a listed ticker." />;
  }

  const related = headlines.filter((item) => item.tickers.includes(security.ticker));
  const owned = book.positions.find((position) => position.ticker === security.ticker);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-primary" href="/markets">All markets</Link>
          <h1 className="serif text-4xl text-forest">{security.ticker} · {security.name}</h1>
          <p className="mt-1 text-sm text-muted">{security.sector} · {security.type.toUpperCase()} · sample quote</p>
        </div>
        <div className="text-right">
          <div className="serif text-4xl text-forest">{money(security.price)}</div>
          <div className={security.dayChange >= 0 ? "up" : "down"}>{percent(security.dayChange)} day</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill>Sample, not live</Pill>
        <Pill>{number(security.holders)} VestEd portfolios</Pill>
        <button className="btn secondary" type="button" onClick={() => toggleWatch(security.ticker)}>
          {watchlist.includes(security.ticker) ? "Remove from watchlist" : "Add to watchlist"}
        </button>
      </div>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.7fr]">
        <div className="card p-4">
          <div className="mb-3 flex gap-2">
            {periods.map((item) => (
              <button key={item.id} className={period === item.id ? "btn" : "btn secondary"} type="button" onClick={() => setPeriod(item.id)}>{item.id}</button>
            ))}
          </div>
          <LineChart points={chart} />
          <p className="mt-2 text-xs text-muted">Illustrative path ending at the sample quote. It is not a stored price history from a vendor.</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Fact label="Previous close" value={money(security.previousClose)} />
            <Fact label="Volume" value={number(security.volume)} />
            <Fact label="Market cap" value={compactMoney(security.marketCap)} />
            <Fact label="Your weight" value={owned ? `${(owned.weight * 100).toFixed(1)}%` : "Not held"} />
          </dl>
          <p className="mt-4 text-sm leading-6">{security.description}</p>
        </div>
        <div className="space-y-4">
          <OrderTicket security={security} />
          <div className="card p-4 text-sm">
            <div className="text-muted">Buying power</div>
            <div className="serif text-2xl text-forest">{money(book.cash)}</div>
            <p className="mt-2 text-muted">Buying power is cash. Margin is not enabled.</p>
          </div>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="serif text-2xl text-forest">Related sample news</h2>
        {related.length === 0 ? <p className="mt-2 text-sm text-muted">No sample brief is attached to this ticker. That is an empty state, not a claim that nothing happened.</p> : (
          <ul className="mt-3 space-y-3">
            {related.map((item) => (
              <li key={item.id}>
                <a className="text-forest hover:underline" href={item.url}>{item.title}</a>
                <div className="text-xs text-muted">{item.publisher} · {shortDate(item.publishedAt)} · sample</div>
                <p className="text-sm text-muted">{item.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase tracking-[0.08em] text-muted">{label}</div><div className="mono mt-1">{value}</div></div>;
}
