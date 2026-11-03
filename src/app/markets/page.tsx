"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { compactMoney, money, number, percent } from "@/lib/format";
import { securities } from "@/lib/sample-data";

export default function MarketsPage() {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const sectors = ["All", ...new Set(securities.map((security) => security.sector))];
  const rows = useMemo(() => {
    return securities.filter((security) => {
      const text = `${security.ticker} ${security.name}`.toLowerCase();
      const matches = text.includes(query.toLowerCase().trim());
      return matches && (sector === "All" || security.sector === sector);
    });
  }, [query, sector]);
  const trending = [...securities].sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange)).slice(0, 4);
  const held = [...securities].sort((a, b) => b.holders - a.holders).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">US stocks and ETFs</div>
          <h1 className="serif text-4xl text-forest">Markets</h1>
        </div>
        <Pill>Delayed sample quotes · not a vendor feed</Pill>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <input className="field" placeholder="Search ticker or company" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search securities" />
        <select className="select" value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Filter by sector">
          {sectors.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <ShortList title="Largest sample moves" rows={trending} />
        <ShortList title="Widely held in VestEd" rows={held} />
      </section>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr><th>Ticker</th><th>Name</th><th>Sector</th><th className="num">Price</th><th className="num">Day</th><th className="num">Mkt cap</th><th className="num">Holders</th></tr>
          </thead>
          <tbody>
            {rows.map((security) => (
              <tr key={security.ticker}>
                <td><Link className="mono text-primary" href={`/markets/${security.ticker}`}>{security.ticker}</Link></td>
                <td>{security.name}</td>
                <td className="text-muted">{security.sector}</td>
                <td className="num mono">{money(security.price)}</td>
                <td className={`num ${security.dayChange >= 0 ? "up" : "down"}`}>{percent(security.dayChange)}</td>
                <td className="num">{compactMoney(security.marketCap)}</td>
                <td className="num">{number(security.holders)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="text-muted">No securities match that search.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShortList({ title, rows }: { title: string; rows: typeof securities }) {
  return (
    <div className="card p-4">
      <h2 className="serif text-2xl text-forest">{title}</h2>
      <ul className="mt-3 divide-y divide-[#e7f0e6]">
        {rows.map((security) => (
          <li key={security.ticker} className="flex items-center justify-between py-2 text-sm">
            <Link href={`/markets/${security.ticker}`}><span className="mono">{security.ticker}</span> <span className="text-muted">{security.name}</span></Link>
            <span className={security.dayChange >= 0 ? "up" : "down"}>{percent(security.dayChange)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
