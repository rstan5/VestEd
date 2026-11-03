"use client";

import Link from "next/link";
import { useState } from "react";
import { Bars, LineChart } from "@/components/chart";
import { OrderTicket } from "@/components/ticket";
import { Delta, Metric, Pill, SectionTitle } from "@/components/ui";
import { dateTime, money, percent, plainPercent } from "@/lib/format";
import { sectorWeights } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/portfolio-state";
import { mayaSeries, seasonMeta, securities } from "@/lib/sample-data";

const ranges = [
  { id: "1M", count: 22 },
  { id: "Season", count: 80 },
  { id: "Round", count: 8 },
];

export default function PortfolioPage() {
  const { book, ledger, standing, seasonReturn } = usePortfolio();
  const [range, setRange] = useState("Season");
  const [ticket, setTicket] = useState(book.positions[0]?.ticker ?? "SPY");
  const selected = securities.find((security) => security.ticker === ticket) ?? securities[0];
  const count = ranges.find((item) => item.id === range)?.count ?? 80;
  const points = mayaSeries.slice(-count).map((point) => ({ label: point.date, value: point.equity, benchmark: point.benchmark }));
  if (points.length) points[points.length - 1] = { ...points[points.length - 1], value: book.equity };
  const sectors = sectorWeights(book);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Book</div>
          <h1 className="serif text-4xl text-forest">Portfolio</h1>
        </div>
        <Pill>Sample quotes · {seasonMeta.quoteLabel}</Pill>
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Equity" value={money(book.equity)} detail={<span className="text-muted">Invested {money(book.invested)}</span>} />
        <Metric label="Cash" value={money(book.cash)} detail={<span className="text-muted">{plainPercent(book.cash / book.equity)} of equity</span>} />
        <Metric label="Unrealized" value={money(book.unrealized)} detail={<Delta value={book.unrealized} text={percent(book.unrealized / Math.max(book.invested - book.unrealized, 1))} />} />
        <Metric label="Realized" value={money(book.realized)} detail={<span className="text-muted">Season {percent(seasonReturn)}</span>} />
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.7fr]">
        <div className="card p-4">
          <SectionTitle title="Performance" action={
            <div className="flex gap-1">
              {ranges.map((item) => (
                <button key={item.id} className={range === item.id ? "btn" : "btn secondary"} type="button" onClick={() => setRange(item.id)}>{item.id}</button>
              ))}
            </div>
          } />
          <LineChart points={points} />
          <p className="mt-2 text-xs text-muted">Green line is the sample portfolio path, adjusted to the current demo equity. Sage line is the frozen S&P path.</p>
        </div>
        <OrderTicket security={selected} />
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.7fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="serif text-2xl text-forest">Holdings</h2>
            <span className="text-xs text-muted">{book.positions.length} positions</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th><th>Company</th><th className="num">Qty</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">Return</th><th className="num">Weight</th>
                </tr>
              </thead>
              <tbody>
                {book.positions.map((position) => (
                  <tr key={position.ticker}>
                    <td><button className="mono text-primary" type="button" onClick={() => setTicket(position.ticker)}>{position.ticker}</button></td>
                    <td><Link href={`/markets/${position.ticker}`}>{position.name}</Link></td>
                    <td className="num mono">{position.quantity}</td>
                    <td className="num mono">{money(position.averageCost)}</td>
                    <td className="num mono">{money(position.price)}</td>
                    <td className="num mono">{money(position.marketValue)}</td>
                    <td className={`num ${position.returnPct >= 0 ? "up" : "down"}`}>{percent(position.returnPct)}</td>
                    <td className="num">{plainPercent(position.weight)}</td>
                  </tr>
                ))}
                {book.positions.length === 0 ? <tr><td colSpan={8} className="text-muted">No holdings. The order ticket can buy from the sample universe.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-4">
          <SectionTitle title="Allocation" />
          <Bars items={sectors.map((sector) => ({ label: sector.sector, value: sector.weight }))} />
          <p className="mt-4 text-sm leading-6 text-muted">
            Diversification {Math.round(standing.diversification * 100)}. Drawdown {standing.drawdown === null ? "insufficient data" : percent(standing.drawdown)}. Volatility {standing.riskAdjusted === null ? "needs 20 observations before it is official" : "available as an estimate"}.
          </p>
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="px-4 pt-4">
          <h2 className="serif text-2xl text-forest">Orders</h2>
          <p className="text-sm text-muted">Rejected orders stay on the blotter and do not change cash.</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table>
            <thead>
              <tr><th>Time</th><th>Side</th><th>Ticker</th><th className="num">Qty</th><th className="num">Fill</th><th>Status</th><th>Rule</th></tr>
            </thead>
            <tbody>
              {ledger.orders.map((order) => (
                <tr key={order.id}>
                  <td className="mono text-xs">{dateTime(order.submittedAt)}</td>
                  <td className="capitalize">{order.side}</td>
                  <td className="mono">{order.ticker}</td>
                  <td className="num">{order.quantity}</td>
                  <td className="num mono">{order.fillPrice === null ? "—" : money(order.fillPrice)}</td>
                  <td className={order.status === "filled" ? "up" : "down"}>{order.status}</td>
                  <td className="max-w-[280px] text-xs text-muted">{order.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
