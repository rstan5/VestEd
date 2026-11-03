"use client";

import Link from "next/link";
import { LineChart, Spark } from "@/components/chart";
import { Delta, Metric, Movement, Pill, SectionTitle } from "@/components/ui";
import { money, percent, plainPercent, shortDate } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import {
  clubById,
  clubStandings,
  
  headlines,
  investorById,
  mayaSeries,
  roundProgress,
  seasonMeta,
  seasonProgress,
  securities,
  universityById,
  universityStandings,
  watchlist as seedWatch,
} from "@/lib/sample-data";

export default function DashboardPage() {
  const { book, standing, standings, watchlist, seasonReturn } = usePortfolio();
  const investor = investorById("maya-chen")!;
  const club = clubById(investor.clubId!)!;
  const university = universityById(investor.universityId)!;
  const clubRank = clubStandings.find((row) => row.clubId === club.id)!;
  const uniRank = universityStandings.find((row) => row.universityId === university.id)!;
  const neighbors = standings.filter((row) => Math.abs(row.rank - standing.rank) <= 1 && row.investorId !== investor.id).slice(0, 2);
  const chart = mayaSeries.slice(-30).map((point) => ({ label: point.date, value: point.equity, benchmark: point.benchmark }));
  chart[chart.length - 1] = { ...chart[chart.length - 1], value: book.equity };
  const day = securities.reduce((sum, security) => {
    const position = book.positions.find((item) => item.ticker === security.ticker);
    return sum + (position ? position.marketValue * security.dayChange : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <section className="hero rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-[#d8ebd5]">Personal command center</div>
            <h1 className="serif mt-2 text-4xl">Fall 2026, round 4</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#eaf5e8]">
              Provisional sample standings. Finalized rounds stay frozen. Your demo trades update only this book.
            </p>
          </div>
          <div className="min-w-[220px] rounded-lg bg-white/10 p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[#d8ebd5]">Semester progress</div>
            <div className="mt-3 h-1.5 rounded-full bg-white/20">
              <div className="h-1.5 rounded-full bg-[#d8ebd5]" style={{ width: `${seasonProgress() * 100}%` }} />
            </div>
            <p className="mt-2 text-sm">{Math.round(roundProgress() * 100)}% of round 4 elapsed on the sample clock.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Portfolio equity" value={money(book.equity, 0)} detail={<span className="text-muted">Cash {money(book.cash)}</span>} />
        <Metric label="Season return" value={percent(seasonReturn)} detail={<Delta value={standing.relative} text={`${percent(standing.relative)} vs sample S&P`} />} hint="From $100,000 starting capital. Time-weighted; trades are not external flows." />
        <Metric label="Round 4" value={percent(standing.roundReturn)} detail={<span className="text-muted">Day move about {money(day)}</span>} hint="Provisional. Official close is Nov 13, 2026." />
        <Metric label="Individual rank" value={`#${standing.rank}`} detail={<Movement current={standing.rank} previous={standing.previousRank} />} hint={`${club.shortName} #${clubRank.rank} · ${university.shortName} #${uniRank.rank}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_0.8fr]">
        <div className="card p-4">
          <SectionTitle eyebrow="Sample path" title="Equity versus benchmark" action={<span className="pill">30 sample sessions</span>} />
          <LineChart points={chart} />
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="text-primary">Portfolio</span>
            <span>Sample S&P path</span>
            <span>As of {shortDate(seasonMeta.asOf)}</span>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <SectionTitle title="Nearest competitors" />
            <ul className="space-y-3">
              {neighbors.map((row) => {
                const person = investorById(row.investorId)!;
                return (
                  <li key={row.investorId} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <Link className="text-forest hover:underline" href={`/investors/${person.id}`}>#{row.rank} {person.name}</Link>
                      <div className="text-xs text-muted">{universityById(person.universityId)?.shortName}</div>
                    </div>
                    <span className={row.seasonReturn >= seasonReturn ? "up" : "down"}>{percent(row.seasonReturn)}</span>
                  </li>
                );
              })}
            </ul>
            <Link className="btn secondary mt-4 inline-flex" href="/competition">Open standings</Link>
          </div>
          <div className="card p-4">
            <SectionTitle title="Exposure" />
            <p className="text-sm text-muted">Largest holding {book.positions[0] ? `${book.positions[0].ticker} ${plainPercent(book.positions[0].weight)}` : "none"}.</p>
            <p className="mt-2 text-sm text-muted">Diversification score {Math.round(standing.diversification * 100)}. Positions under 2% do not count.</p>
            <Link className="mt-3 inline-block text-sm text-primary" href="/portfolio">Review the book</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <SectionTitle title="Watchlist" action={<Pill>Sample</Pill>} />
          <ul className="divide-y divide-[#e7f0e6]">
            {(watchlist.length ? watchlist : seedWatch).map((ticker) => {
              const security = securities.find((item) => item.ticker === ticker);
              if (!security) return null;
              return (
                <li key={ticker} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/markets/${ticker}`} className="mono text-forest">{ticker}</Link>
                  <span className="flex items-center gap-3">
                    <Spark values={[security.previousClose, security.price]} />
                    <span className={security.dayChange >= 0 ? "up" : "down"}>{percent(security.dayChange)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-4">
          <SectionTitle title="Sample headlines" />
          <ul className="space-y-3">
            {headlines.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link href="/research" className="text-sm text-forest hover:underline">{item.title}</Link>
                <div className="text-xs text-muted">{item.publisher} · {shortDate(item.publishedAt)}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <SectionTitle title="Professor preview" action={<Pill>Demonstration</Pill>} />
          <p className="text-sm leading-6 text-forest">
            The top holding is {book.positions[0]?.ticker ?? "unset"} at {book.positions[0] ? plainPercent(book.positions[0].weight) : "0%"}. A trim changes drawdown risk more reliably than a token new position changes diversification.
          </p>
          <Link className="btn secondary mt-4 inline-flex" href="/professor">Ask a follow-up</Link>
        </div>
      </section>
    </div>
  );
}
