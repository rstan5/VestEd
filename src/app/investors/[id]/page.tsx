"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LineChart } from "@/components/chart";
import { EmptyState, Movement, Pill } from "@/components/ui";
import { percent, plainPercent } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import { clubById, investorById, mayaSeries, rounds, universityById } from "@/lib/sample-data";

export default function InvestorPage() {
  const params = useParams<{ id: string }>();
  const investor = investorById(params.id);
  const { standings, book } = usePortfolio();
  if (!investor) return <EmptyState title="Investor not found" body="That profile is not in the Fall 2026 sample field." />;
  const standing = standings.find((row) => row.investorId === investor.id);
  const university = universityById(investor.universityId);
  const club = investor.clubId ? clubById(investor.clubId) : undefined;
  const isDemo = investor.id === "maya-chen";
  const chart = mayaSeries.slice(-24).map((point, index) => ({
    label: point.date,
    value: isDemo && index === 23 ? book.equity : point.equity * (0.92 + (standing?.seasonReturn ?? 0.03)),
    benchmark: point.benchmark,
  }));

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="hero px-6 py-6">
          <div className="text-xs uppercase tracking-[0.12em] text-[#d8ebd5]">Investor profile</div>
          <h1 className="serif mt-2 text-4xl">{investor.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#eaf5e8]">{investor.bio}</p>
        </div>
        <div className="grid gap-4 px-6 py-4 md:grid-cols-4">
          <Fact label="University" value={university?.shortName ?? "—"} />
          <Fact label="Club" value={club ? club.shortName : "Independent"} />
          <Fact label="Class" value={String(investor.classYear)} />
          <Fact label="Study" value={investor.concentration} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill tone={investor.verified ? "dark" : "warn"}>{investor.verified ? "Affiliation verified" : "Verification pending"}</Pill>
        <Pill>{investor.eligible ? "Eligible for institutional boards" : "Open individual board only"}</Pill>
        <Pill>{investor.publicHoldings ? "Holdings published" : "Holdings private"}</Pill>
      </div>
      {standing ? (
        <section className="grid gap-3 md:grid-cols-4">
          <Fact label="Current rank" value={`#${standing.rank}`} extra={<Movement current={standing.rank} previous={standing.previousRank} />} />
          <Fact label="Peak rank" value={investor.peakRank ? `#${investor.peakRank}` : "Unranked"} />
          <Fact label="Season return" value={percent(standing.seasonReturn)} />
          <Fact label="Score" value={standing.score.toFixed(1)} />
        </section>
      ) : (
        <EmptyState title="Not on the official individual board" body="Pending verification keeps this student off institutional rankings. Open-board participation can still be recorded once a season registration exists." />
      )}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card p-4">
          <h2 className="serif text-2xl text-forest">Season path</h2>
          <p className="mb-3 text-xs text-muted">{isDemo ? "Your demo book updates the last point." : "Illustrative sample path scaled to the published season return. Not a tick history."}</p>
          <LineChart points={chart} />
        </div>
        <div className="card p-4">
          <h2 className="serif text-2xl text-forest">Record</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {rounds.filter((round) => round.status !== "scheduled").map((round) => (
              <li key={round.id} className="flex justify-between border-b border-[#e7f0e6] py-2">
                <span>{round.name}</span>
                <span className="text-muted">{round.status === "final" ? "Final" : "Provisional"}</span>
              </li>
            ))}
          </ul>
          <h3 className="serif mt-4 text-xl text-forest">Awards</h3>
          {investor.awards.length === 0 ? <p className="mt-1 text-sm text-muted">No season awards yet.</p> : (
            <ul className="mt-2 list-disc pl-4 text-sm">{investor.awards.map((award) => <li key={award}>{award}</li>)}</ul>
          )}
        </div>
      </section>
      <section className="card p-4">
        <h2 className="serif text-2xl text-forest">Holdings visibility</h2>
        {isDemo ? (
          <div className="mt-3">
            <p className="text-sm text-muted">This is your demo book. Public visitors would see it only if you published holdings. They are private in the sample profile.</p>
            <table className="mt-3">
              <thead><tr><th>Ticker</th><th className="num">Weight</th><th className="num">Return</th></tr></thead>
              <tbody>
                {book.positions.map((position) => (
                  <tr key={position.ticker}><td className="mono">{position.ticker}</td><td className="num">{plainPercent(position.weight)}</td><td className="num">{percent(position.returnPct)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : investor.publicHoldings ? (
          <p className="mt-2 text-sm text-muted">Published holding list is not stored for other students in this prototype. Public pages show aggregate statistics only, so private books cannot be inferred.</p>
        ) : (
          <p className="mt-2 text-sm text-muted">Holdings are private. Competitor views and the AI Professor cannot read them.</p>
        )}
        <div className="mt-4 flex gap-3 text-sm">
          {university ? <Link className="text-primary" href={`/universities/${university.id}`}>{university.shortName}</Link> : null}
          {club ? <Link className="text-primary" href={`/clubs/${club.id}`}>{club.name}</Link> : null}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="serif mt-1 text-2xl text-forest">{value}</div>
      {extra}
    </div>
  );
}
