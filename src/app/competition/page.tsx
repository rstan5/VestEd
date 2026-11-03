"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Movement, Pill } from "@/components/ui";
import type { MetricKey } from "@/lib/domain";
import { percent } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import {
  archivedChampions,
  clubById,
  clubStandings,
  investorById,
  rounds,
  sampleHistoryNote,
  seasonMeta,
  universities,
  universityById,
  universityStandings,
} from "@/lib/sample-data";

type Board = "individual" | "club" | "university";
type Period = "season" | "round" | "archive";

const sorts: Array<{ id: MetricKey; label: string }> = [
  { id: "return", label: "Return" },
  { id: "score", label: "Overall score" },
  { id: "riskAdjusted", label: "Risk-adjusted" },
  { id: "diversification", label: "Diversification" },
  { id: "drawdown", label: "Drawdown" },
  { id: "consistency", label: "Consistency" },
  { id: "relative", label: "Vs benchmark" },
];

export default function CompetitionPage() {
  const { standings } = usePortfolio();
  const [board, setBoard] = useState<Board>("individual");
  const [period, setPeriod] = useState<Period>("season");
  const [sort, setSort] = useState<MetricKey>("score");
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState("all");
  const [compare, setCompare] = useState<string[]>([]);

  const rows = useMemo(() => {
    const source = board === "individual" ? standings.map(toIndividual) : board === "club" ? clubStandings.map(toClub) : universityStandings.map(toUniversity);
    return source
      .filter((row) => row.name.toLowerCase().includes(query.toLowerCase().trim()))
      .filter((row) => university === "all" || row.universityId === university)
      .sort((a, b) => compareMetric(a, b, sort));
  }, [board, query, university, sort, standings]);

  function toggleCompare(id: string) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id].slice(-2);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Standings</div>
          <h1 className="serif text-4xl text-forest">Competition</h1>
        </div>
        <Pill>{seasonMeta.standingsLabel}</Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        <Toggle values={["individual", "club", "university"]} current={board} onChange={(value) => { setBoard(value as Board); setCompare([]); }} />
        <Toggle values={["season", "round", "archive"]} current={period} onChange={(value) => setPeriod(value as Period)} labels={["Semester", "Round 4", "Archive"]} />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, clubs, or universities" aria-label="Search standings" />
        <select className="select" value={university} onChange={(event) => setUniversity(event.target.value)} aria-label="Filter by university">
          <option value="all">All universities</option>
          {universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}
        </select>
        <select className="select" value={sort} onChange={(event) => setSort(event.target.value as MetricKey)} aria-label="Sort standings">
          {sorts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      {period === "archive" ? (
        <div className="card p-4">
          <h2 className="serif text-2xl text-forest">Archived champions</h2>
          <p className="mt-1 text-sm text-muted">{sampleHistoryNote}</p>
          <table className="mt-3">
            <thead><tr><th>Season</th><th>Individual</th><th>Club</th><th>University</th></tr></thead>
            <tbody>
              {archivedChampions.map((item) => (
                <tr key={item.season}><td>{item.season}</td><td>{item.individual}</td><td>{item.club}</td><td>{item.university}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>Move</th><th>Name</th><th>Affiliation</th><th className="num">Return</th><th className="num">Score</th><th className="num">Risk-adj.</th><th className="num">Drawdown</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="mono">{index + 1}</td>
                  <td><Movement current={row.rank} previous={row.previousRank} /></td>
                  <td><Link className="text-forest hover:underline" href={row.href}>{row.name}</Link></td>
                  <td className="text-muted">{row.affiliation}</td>
                  <td className={`num ${row.returnPct >= 0 ? "up" : "down"}`}>{percent(period === "round" ? row.roundReturn : row.returnPct)}</td>
                  <td className="num mono">{row.score.toFixed(1)}</td>
                  <td className="num">{row.riskAdjusted === null ? "Insufficient" : row.riskAdjusted.toFixed(2)}</td>
                  <td className="num">{row.drawdown === null ? "Insufficient" : percent(row.drawdown)}</td>
                  <td><button className="btn secondary" type="button" onClick={() => toggleCompare(row.id)}>{compare.includes(row.id) ? "Selected" : "Compare"}</button></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={9}>No entries match those filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <Compare ids={compare} board={board} standings={standings} />
      <p className="text-xs leading-5 text-muted">
        Standings as of {seasonMeta.asOf}. Quotes are a separate clock and do not move official boards. Score weights: return 30, risk-adjusted 20, drawdown 15, diversification 15, consistency 10, relative 10. Missing components are dropped, not treated as zero. Club and university figures are equal-weighted eligible averages. {rounds.filter((round) => round.status === "final").map((round) => round.name).join(", ")} are final.
      </p>
    </div>
  );
}

function Compare({ ids, board, standings }: { ids: string[]; board: Board; standings: ReturnType<typeof usePortfolio>["standings"] }) {
  if (ids.length < 2) return <p className="text-sm text-muted">Select two rows to compare public statistics. Private holdings stay hidden.</p>;
  const rows = ids.map((id) => findRow(board, id, standings)).filter((row): row is Row => Boolean(row));
  if (rows.length < 2) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.id} className="card p-4">
          <h3 className="serif text-2xl text-forest">{row.name}</h3>
          <p className="text-sm text-muted">{row.affiliation}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Line label="Season return" value={percent(row.returnPct)} />
            <Line label="Score" value={row.score.toFixed(1)} />
            <Line label="Diversification" value={String(Math.round(row.diversification * 100))} />
            <Line label="Vs benchmark" value={percent(row.relative)} />
          </dl>
        </div>
      ))}
    </div>
  );
}

type Row = {
  id: string;
  name: string;
  href: string;
  affiliation: string;
  universityId: string;
  returnPct: number;
  roundReturn: number;
  score: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  consistency: number | null;
  relative: number;
  rank: number;
  previousRank: number;
};

function toIndividual(row: ReturnType<typeof usePortfolio>["standings"][number]): Row {
  const investor = investorById(row.investorId)!;
  const club = investor.clubId ? clubById(investor.clubId) : undefined;
  return {
    id: investor.id,
    name: investor.name,
    href: `/investors/${investor.id}`,
    affiliation: `${universityById(investor.universityId)?.shortName}${club ? ` · ${club.shortName}` : " · Independent"}`,
    universityId: investor.universityId,
    returnPct: row.seasonReturn,
    roundReturn: row.roundReturn,
    score: row.score,
    riskAdjusted: row.riskAdjusted,
    drawdown: row.drawdown,
    diversification: row.diversification,
    consistency: row.consistency,
    relative: row.relative,
    rank: row.rank,
    previousRank: row.previousRank,
  };
}

function toClub(row: (typeof clubStandings)[number]): Row {
  const club = clubById(row.clubId)!;
  return base(club.id, club.name, `/clubs/${club.id}`, universityById(club.universityId)?.shortName ?? "", club.universityId, row);
}

function toUniversity(row: (typeof universityStandings)[number]): Row {
  const university = universityById(row.universityId)!;
  return base(university.id, university.name, `/universities/${university.id}`, university.conference, university.id, row);
}

function base(id: string, name: string, href: string, affiliation: string, universityId: string, row: { seasonReturn: number; roundReturn: number; score: number; riskAdjusted: number | null; drawdown: number | null; diversification: number; consistency: number | null; relative: number; rank: number; previousRank: number }): Row {
  return { id, name, href, affiliation, universityId, returnPct: row.seasonReturn, roundReturn: row.roundReturn, score: row.score, riskAdjusted: row.riskAdjusted, drawdown: row.drawdown, diversification: row.diversification, consistency: row.consistency, relative: row.relative, rank: row.rank, previousRank: row.previousRank };
}

function findRow(board: Board, id: string, standings: ReturnType<typeof usePortfolio>["standings"]): Row | undefined {
  if (board === "club") {
    const row = clubStandings.find((item) => item.clubId === id);
    return row ? toClub(row) : undefined;
  }
  if (board === "university") {
    const row = universityStandings.find((item) => item.universityId === id);
    return row ? toUniversity(row) : undefined;
  }
  const row = standings.find((item) => item.investorId === id);
  return row ? toIndividual(row) : undefined;
}

function compareMetric(a: Row, b: Row, sort: MetricKey): number {
  const left = metric(a, sort);
  const right = metric(b, sort);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return sort === "drawdown" ? left - right : right - left;
}

function metric(row: Row, sort: MetricKey): number | null {
  if (sort === "return") return row.returnPct;
  if (sort === "score") return row.score;
  if (sort === "riskAdjusted") return row.riskAdjusted;
  if (sort === "diversification") return row.diversification;
  if (sort === "drawdown") return row.drawdown;
  if (sort === "consistency") return row.consistency;
  return row.relative;
}

function Toggle({ values, current, onChange, labels }: { values: string[]; current: string; onChange: (value: string) => void; labels?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value, index) => (
        <button key={value} className={current === value ? "btn" : "btn secondary"} type="button" onClick={() => onChange(value)}>
          {labels?.[index] ?? value[0].toUpperCase() + value.slice(1)}
        </button>
      ))}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-muted">{label}</dt><dd>{value}</dd></div>;
}
