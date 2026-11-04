"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LineChart } from "@/components/chart";
import { Movement, StatusNote, Tag } from "@/components/ui";
import { percent, plainPercent } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import { clubById, investorById, mayaSeries, rounds, universityById } from "@/lib/sample-data";

export default function InvestorPage() {
  const params = useParams<{ id: string }>();
  const investor = investorById(params.id);
  const { standings, book } = usePortfolio();
  if (!investor) {
    return (
      <div className="mx-auto max-w-[880px]">
        <StatusNote
          kind="empty"
          title="Investor not found"
          body="That profile is not in the Fall 2026 sample field. The real student directory is not part of this build."
          action={<Link href="/competition" className="v-btn quiet small">Back to standings</Link>}
        />
      </div>
    );
  }
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
    <div className="mx-auto max-w-[880px]">
      <Link href="/competition" className="inline-flex items-center gap-1.5 text-sm text-quiet underline-offset-4 hover:text-forest hover:underline">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M7.5 3 4.5 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        Competition
      </Link>

      <header className="mt-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-quiet">
          Investor profile <Tag kind="sample">Sample</Tag>
        </p>
        <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest">{investor.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-quiet">{investor.bio}</p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Status">
          <li>{investor.verified ? <Tag kind="provisional">Affiliation verified</Tag> : <Tag kind="unavailable">Verification pending</Tag>}</li>
          <li><Tag>{investor.eligible ? "Eligible for institutional boards" : "Open individual board only"}</Tag></li>
          <li><Tag>{investor.publicHoldings ? "Holdings published" : "Holdings private"}</Tag></li>
        </ul>
      </header>

      <dl className="mt-8 grid divide-y divide-rule border-y border-rule sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <Fact label="University" value={university?.shortName ?? "—"} />
        <Fact label="Club" value={club ? club.shortName : "Independent"} />
        <Fact label="Class" value={String(investor.classYear)} />
        <Fact label="Study" value={investor.concentration} />
      </dl>

      <section aria-labelledby="standing-heading" className="mt-12">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="standing-heading" className="text-sm text-quiet">Standing</h2>
          <Tag kind="sample">Sample season</Tag>
        </div>
        {standing ? (
          <dl className="mt-3 grid grid-cols-2 gap-y-6 border-y border-rule py-5 md:grid-cols-4 md:divide-x md:divide-rule">
            <Stat label="Current rank" value={`#${standing.rank}`} extra={<Movement current={standing.rank} previous={standing.previousRank} />} />
            <Stat label="Peak rank" value={investor.peakRank ? `#${investor.peakRank}` : "Unranked"} />
            <Stat label="Season return" value={percent(standing.seasonReturn)} tone={standing.seasonReturn} />
            <Stat label="Score" value={standing.score.toFixed(1)} />
          </dl>
        ) : (
          <div className="mt-3">
            <StatusNote kind="empty" compact title="Not on the individual board" body="Pending verification keeps this student off institutional rankings. Open-board participation can still be recorded once a season registration exists." />
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="path-heading" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="path-heading" className="text-sm font-medium text-forest">Season path</h2>
            <Tag kind="sample">Sample</Tag>
          </div>
          <div className="mt-4">
            <LineChart points={chart} />
          </div>
          <p className="mt-3 max-w-[640px] text-[13px] leading-5 text-quiet">
            {isDemo ? "Your sample book updates the last point." : "An illustrative path scaled to the published sample return."} The pale line is an illustrative benchmark, not a licensed index. Neither is a tick history.
          </p>
        </section>

        <aside aria-labelledby="record-heading">
          <h2 id="record-heading" className="text-sm font-medium text-forest">Record</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            {rounds.filter((round) => round.status !== "scheduled").map((round) => (
              <li key={round.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-forest">{round.name}</span>
                {round.status === "final" ? <Tag>Final</Tag> : <Tag kind="provisional">Provisional</Tag>}
              </li>
            ))}
          </ul>
          <h3 className="mt-8 text-sm font-medium text-forest">Awards</h3>
          {investor.awards.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-quiet">No season awards yet.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
              {investor.awards.map((award) => <li key={award}>{award}</li>)}
            </ul>
          )}
        </aside>
      </div>

      <section aria-labelledby="holdings-heading" className="mt-12 border-t border-rule pt-10">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="holdings-heading" className="serif text-[28px] text-forest">Holdings visibility</h2>
          {investor.publicHoldings || isDemo ? null : <Tag>Private</Tag>}
        </div>
        {isDemo ? (
          <div className="mt-4">
            <p className="max-w-xl text-sm leading-6 text-quiet">
              This is your sample book. Other students would see it only if you published holdings, and the sample profile keeps them private.
            </p>
            <div className="mt-4 max-w-xl overflow-x-auto">
              <table className="v-table">
                <thead>
                  <tr><th className="text-left">Ticker</th><th className="num">Weight</th><th className="num">Return</th></tr>
                </thead>
                <tbody>
                  {book.positions.map((position) => (
                    <tr key={position.ticker}>
                      <td className="mono">{position.ticker}</td>
                      <td className="num mono">{plainPercent(position.weight)}</td>
                      <td className="num mono">{percent(position.returnPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[12px] text-quiet"><Tag kind="sample">Sample book</Tag> Weights and sample returns only.</p>
          </div>
        ) : investor.publicHoldings ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-quiet">
            This sample profile is marked as publishing holdings, but the per-position list is not stored in this build. Public pages show aggregate statistics only, so private books cannot be inferred.
          </p>
        ) : (
          <p className="mt-3 max-w-xl text-sm leading-6 text-quiet">
            Holdings are private. Competitor views and the Professor cannot read positions, quantities, cash, orders, or activity.
          </p>
        )}
        <p className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Tag kind="sample">Sample directory</Tag>
          {university ? <Link className="text-primary underline-offset-4 hover:underline" href={`/universities/${university.id}`}>{university.shortName}</Link> : null}
          {club ? <Link className="text-primary underline-offset-4 hover:underline" href={`/clubs/${club.id}`}>{club.name}</Link> : null}
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-4 lg:px-5 lg:first:pl-0">
      <dt className="text-[12px] text-quiet">{label}</dt>
      <dd className="mt-1 text-[15px] text-forest">{value}</dd>
    </div>
  );
}

function Stat({ label, value, extra, tone: kind }: { label: string; value: string; extra?: React.ReactNode; tone?: number }) {
  return (
    <div className="md:px-5 md:first:pl-0">
      <dt className="text-[12px] text-quiet">{label}</dt>
      <dd className={`mono mt-1 text-[17px] ${kind === undefined ? "text-deep" : kind > 0 ? "up" : kind < 0 ? "down" : "text-deep"}`}>{value}</dd>
      {extra ? <dd className="mt-0.5 text-[12px]">{extra}</dd> : null}
    </div>
  );
}
