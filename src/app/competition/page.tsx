"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock, Movement, Skeleton, StatusNote, Tag } from "@/components/ui";
import { DEMO_INVESTOR_ID, MIN_CONSISTENCY_ROUNDS, MIN_DRAWDOWN_OBS, MIN_RISK_OBS, type Round, type Standing } from "@/lib/domain";
import { percent, shortDate, tone } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import {
  clubById,
  clubStandings,
  investorById,
  rounds,
  seasonMeta,
  universities,
  universityById,
  universityStandings,
} from "@/lib/sample-data";

type Board = "individual" | "club" | "university";
type SortKey = "rank" | "return" | "score" | "riskAdjusted" | "diversification" | "drawdown" | "consistency";

const boards: Array<{ id: Board; label: string; noun: string }> = [
  { id: "individual", label: "Students", noun: "students" },
  { id: "club", label: "Clubs", noun: "clubs" },
  { id: "university", label: "Universities", noun: "universities" },
];

const seasons = [
  { id: seasonMeta.id, label: seasonMeta.name },
  { id: "2025-26", label: "2025–26 academic year" },
];

const sorts: Array<{ id: SortKey; label: string }> = [
  { id: "rank", label: "Official rank" },
  { id: "return", label: "Return" },
  { id: "score", label: "Score" },
  { id: "riskAdjusted", label: "Risk-adjusted" },
  { id: "diversification", label: "Diversification" },
  { id: "drawdown", label: "Drawdown" },
  { id: "consistency", label: "Consistency" },
];

const MAX_COMPARE = 3;

type Row = {
  id: string;
  name: string;
  href: string;
  affiliation: string;
  universityId: string;
  seasonReturn: number;
  roundReturn: number;
  score: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  consistency: number | null;
  rank: number;
  previousRank: number;
  self: boolean;
};

export default function LeaderboardPage() {
  const { ready, standings } = usePortfolio();
  const [board, setBoard] = useState<Board>("individual");
  const [season, setSeason] = useState(seasonMeta.id);
  const [roundId, setRoundId] = useState("season");
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [compare, setCompare] = useState<string[]>([]);

  const round = rounds.find((item) => item.id === roundId);
  const { rows: allRows, missing } = useMemo(() => buildRows(board, standings), [board, standings]);
  const useRound = round?.status === "live";
  const rows = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return allRows
      .filter((row) => row.name.toLowerCase().includes(needle) || row.affiliation.toLowerCase().includes(needle))
      .filter((row) => university === "all" || row.universityId === university)
      .sort((a, b) => compareRows(a, b, sort, useRound));
  }, [allRows, query, university, sort, useRound]);
  const selected = compare.map((id) => allRows.find((row) => row.id === id)).filter((row): row is Row => Boolean(row));
  const noun = boards.find((item) => item.id === board)?.noun ?? "entries";

  function toggleCompare(id: string) {
    setCompare((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_COMPARE ? current : [...current, id]));
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-quiet">
            Compete <Tag kind="sample">Sample standings</Tag>
          </p>
          <h1 className="serif mt-1 text-[40px] leading-none text-forest">Standings</h1>
        </div>
        <Methodology />
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <div className="v-segment self-start" role="group" aria-label="Board">
          {boards.map((item) => (
            <button key={item.id} type="button" aria-pressed={board === item.id} onClick={() => { setBoard(item.id); setCompare([]); }}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)] lg:grid-cols-[180px_200px_minmax(0,1fr)_170px_170px]">
          <Select label="Season" value={season} onChange={(value) => { setSeason(value); setRoundId("season"); }} options={seasons.map((item) => ({ value: item.id, label: item.label }))} />
          <Select
            label="Round"
            value={roundId}
            onChange={setRoundId}
            disabled={season !== seasonMeta.id}
            options={[{ value: "season", label: "Whole season" }, ...rounds.map((item) => ({ value: item.id, label: `${item.name} · ${roundStatusLabel(item)}` }))]}
          />
          <label className="col-span-2 block md:col-span-1">
            <span className="text-[12px] text-quiet">Search</span>
            <input className="v-field mt-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${noun}`} />
          </label>
          <Select label="University" value={university} onChange={setUniversity} options={[{ value: "all", label: "All universities" }, ...universities.map((item) => ({ value: item.id, label: item.shortName }))]} />
          <Select label="Sort by" value={sort} onChange={(value) => setSort(value as SortKey)} options={sorts.map((item) => ({ value: item.id, label: item.label }))} />
        </div>
      </div>

      <div className="mt-8">
        {!ready ? (
          <BoardLoading />
        ) : season !== seasonMeta.id ? (
          <StatusNote
            kind="empty"
            title="No finalized results for the 2025–26 academic year"
            body="VestEd stores no finalized rounds from that year. Past champions appear here only from finalized results, so none are listed."
          />
        ) : round && round.status === "final" ? (
          <StatusNote
            kind="unavailable"
            title={`${round.name} results are not loaded`}
            body={`${round.name} closed ${shortDate(round.end)} and is final, but this sample build has no stored round results to show. They will come from the server's finalized standings.`}
          />
        ) : round && round.status === "scheduled" ? (
          <StatusNote kind="empty" title={`${round.name} has not started`} body={`It opens ${shortDate(`${round.start}T12:00:00.000Z`)}. Standings appear after its first end-of-day valuation.`} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-quiet">
              <p>
                {rows.length} of {allRows.length} {noun} · {useRound && round ? `${round.name} return, provisional` : "Season to date"} · as of {shortDate(seasonMeta.asOf)}
              </p>
              <Tag kind="unavailable">Vs S&amp;P 500 unavailable</Tag>
            </div>
            {missing > 0 ? (
              <div className="mb-3">
                <StatusNote kind="error" compact title={`${missing} ${missing === 1 ? "entry" : "entries"} could not be loaded`} body="Those rows are missing their profile record and are left out of this view. Official ranks of the other rows are unchanged." />
              </div>
            ) : null}
            {rows.length === 0 ? (
              <StatusNote kind="empty" title="No matches" body="No entries match that search or university filter. Official ranks do not change when you filter." action={<button type="button" className="v-btn quiet small" onClick={() => { setQuery(""); setUniversity("all"); }}>Clear filters</button>} />
            ) : (
              <BoardTable rows={rows} useRound={useRound} compare={compare} onToggle={toggleCompare} board={board} />
            )}
          </>
        )}
      </div>

      {ready && season === seasonMeta.id && (!round || round.status === "live") ? (
        <CompareTray rows={selected} onRemove={toggleCompare} onClear={() => setCompare([])} useRound={useRound} />
      ) : null}
    </div>
  );
}

function BoardTable({ rows, useRound, compare, onToggle, board }: { rows: Row[]; useRound: boolean; compare: string[]; onToggle: (id: string) => void; board: Board }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-rule bg-paper">
      <table className="v-table">
        <caption className="sr-only">Official standings. The rank column is the official rank and does not change when you sort or filter.</caption>
        <thead>
          <tr>
            <th className="w-[72px] text-left">Rank</th>
            <th className="hidden w-[64px] text-left md:table-cell">Move</th>
            <th className="text-left">{board === "individual" ? "Student" : board === "club" ? "Club" : "University"}</th>
            <th className="num">Return</th>
            <th className="num hidden md:table-cell">Score</th>
            <th className="num hidden lg:table-cell">Risk-adj.</th>
            <th className="num hidden md:table-cell">Drawdown</th>
            <th className="num hidden lg:table-cell">Diversif.</th>
            <th className="w-[72px] text-center">Compare</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const value = useRound ? row.roundReturn : row.seasonReturn;
            const checked = compare.includes(row.id);
            return (
              <tr key={row.id} data-self={row.self}>
                <td className="mono text-[15px] text-deep">
                  {row.rank}
                  <span className="mt-0.5 block text-[11px] md:hidden"><Movement current={row.rank} previous={row.previousRank} /></span>
                </td>
                <td className="hidden text-[13px] md:table-cell"><Movement current={row.rank} previous={row.previousRank} /></td>
                <td>
                  <span className="flex items-center gap-2">
                    <Link href={row.href} className="text-[15px] text-forest hover:underline">{row.name}</Link>
                    {row.self ? <Tag kind="provisional">You</Tag> : null}
                  </span>
                  <span className="block text-[12px] text-quiet">{row.affiliation}</span>
                </td>
                <td className={`num mono ${tone(value)}`}>{percent(value)}</td>
                <td className="num mono hidden md:table-cell">{row.score.toFixed(1)}</td>
                <td className="num hidden lg:table-cell">{row.riskAdjusted === null ? <Insufficient /> : <span className="mono">{row.riskAdjusted.toFixed(2)}</span>}</td>
                <td className="num hidden md:table-cell">{row.drawdown === null ? <Insufficient /> : <span className="mono">{percent(row.drawdown)}</span>}</td>
                <td className="num mono hidden lg:table-cell">{Math.round(row.diversification * 100)}</td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#247448]"
                    checked={checked}
                    disabled={!checked && compare.length >= MAX_COMPARE}
                    onChange={() => onToggle(row.id)}
                    aria-label={`Compare ${row.name}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompareTray({ rows, onRemove, onClear, useRound }: { rows: Row[]; onRemove: (id: string) => void; onClear: () => void; useRound: boolean }) {
  const [open, setOpen] = useState(false);
  const tray = useRef<HTMLElement>(null);
  const expanded = open && rows.length >= 2;

  useEffect(() => {
    if (expanded) tray.current?.scrollIntoView({ block: "nearest" });
  }, [expanded]);
  return (
    <section
      ref={tray}
      aria-labelledby="compare-title"
      className={`z-20 mt-8 rounded-2xl border border-rule bg-paper/95 shadow-[0_10px_30px_rgba(16,59,43,0.06)] backdrop-blur-sm ${expanded ? "" : "sticky bottom-[76px] md:bottom-4"}`}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h2 id="compare-title" className="text-sm font-medium text-forest">Compare</h2>
        {rows.length === 0 ? (
          <p className="text-[13px] text-quiet">
            <span className="md:hidden">Tick up to {MAX_COMPARE} rows.</span>
            <span className="hidden md:inline">Tick up to {MAX_COMPARE} rows to compare public statistics. Private holdings stay hidden.</span>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <li key={row.id} className="inline-flex items-center gap-1 rounded-full border border-rule bg-wash py-0.5 pl-3 pr-1 text-[13px] text-forest">
                {row.name}
                <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-mint" onClick={() => onRemove(row.id)} aria-label={`Remove ${row.name} from comparison`}>
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto flex gap-2">
          {rows.length > 0 ? <button type="button" className="v-btn quiet small" onClick={onClear}>Clear</button> : null}
          <button type="button" className="v-btn small" disabled={rows.length < 2} aria-expanded={expanded} aria-controls="compare-panel" onClick={() => setOpen((value) => !value)}>
            {expanded ? "Hide" : rows.length < 2 ? "Pick two" : `Compare ${rows.length}`}
          </button>
        </div>
      </div>
      {expanded ? (
        <div id="compare-panel" className="max-h-[50vh] overflow-auto border-t border-rule px-4 pb-4">
          <table className="v-table">
            <thead>
              <tr>
                <th className="text-left">Statistic</th>
                {rows.map((row) => <th key={row.id} className="num">{row.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <CompareLine label="Official rank" rows={rows} render={(row) => <span className="mono">{row.rank}</span>} />
              <CompareLine label={useRound ? "Round return" : "Season return"} rows={rows} render={(row) => <span className={`mono ${tone(useRound ? row.roundReturn : row.seasonReturn)}`}>{percent(useRound ? row.roundReturn : row.seasonReturn)}</span>} />
              <CompareLine label="Score" rows={rows} render={(row) => <span className="mono">{row.score.toFixed(1)}</span>} />
              <CompareLine label="Risk-adjusted" rows={rows} render={(row) => (row.riskAdjusted === null ? <Insufficient /> : <span className="mono">{row.riskAdjusted.toFixed(2)}</span>)} />
              <CompareLine label="Drawdown" rows={rows} render={(row) => (row.drawdown === null ? <Insufficient /> : <span className="mono">{percent(row.drawdown)}</span>)} />
              <CompareLine label="Diversification" rows={rows} render={(row) => <span className="mono">{Math.round(row.diversification * 100)}</span>} />
              <CompareLine label="Consistency" rows={rows} render={(row) => (row.consistency === null ? <Insufficient /> : <span className="mono">{Math.round(row.consistency * 100)}</span>)} />
              <CompareLine label="Vs S&P 500" rows={rows} render={() => <span className="text-quiet">Unavailable</span>} />
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function CompareLine({ label, rows, render }: { label: string; rows: Row[]; render: (row: Row) => React.ReactNode }) {
  return (
    <tr>
      <td className="text-quiet">{label}</td>
      {rows.map((row) => <td key={row.id} className="num">{render(row)}</td>)}
    </tr>
  );
}

function Methodology() {
  return (
    <details className="group relative z-[25]">
      <summary className="v-btn quiet small cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        How ranking works
        <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </summary>
      <div className="absolute left-0 z-40 mt-2 w-[min(calc(100vw-40px),420px)] md:left-auto md:right-0 rounded-2xl border border-rule bg-paper p-5 text-[13px] leading-6 text-quiet shadow-[0_18px_40px_rgba(16,59,43,0.08)]">
        <p className="text-forest">The rank column is the official rank. Sorting and filtering change the view, never the number.</p>
        <ul className="mt-3 list-disc space-y-1 pl-4">
          <li>Score weights: return 30, risk-adjusted 20, drawdown 15, diversification 15, consistency 10, vs benchmark 10. Missing parts are dropped and the rest renormalized.</li>
          <li>Drawdown needs {MIN_DRAWDOWN_OBS} return intervals, risk-adjusted needs {MIN_RISK_OBS}, consistency needs {MIN_CONSISTENCY_ROUNDS} finalized rounds. Below that it reads Not enough data, not zero.</li>
          <li>Club and university figures are equal-weight averages of eligible students, so size alone does not help.</li>
          <li>Benchmark-relative return is unavailable until a licensed S&amp;P 500 total-return series is connected.</li>
          <li>Finalized rounds are frozen. The live round is provisional until it closes.</li>
        </ul>
      </div>
    </details>
  );
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] text-quiet">{label}</span>
      <select className="v-field mt-1 disabled:opacity-50" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Insufficient() {
  return <span className="text-[12px] text-quiet">Not enough data</span>;
}

function BoardLoading() {
  return (
    <LoadingBlock label="Loading standings">
      <div className="space-y-2 rounded-2xl border border-rule bg-paper p-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
      </div>
    </LoadingBlock>
  );
}

function roundStatusLabel(round: Round): string {
  if (round.status === "final") return "Final";
  if (round.status === "live") return "Provisional";
  return "Scheduled";
}

function buildRows(board: Board, standings: Standing[]): { rows: Row[]; missing: number } {
  const rows: Row[] = [];
  let missing = 0;
  if (board === "individual") {
    for (const row of standings) {
      const investor = investorById(row.investorId);
      if (!investor) {
        missing += 1;
        continue;
      }
      const club = investor.clubId ? clubById(investor.clubId) : undefined;
      rows.push({
        ...metrics(row),
        id: investor.id,
        name: investor.name,
        href: `/investors/${investor.id}`,
        affiliation: `${universityById(investor.universityId)?.shortName ?? "University unavailable"} · ${club ? club.shortName : "Independent"}`,
        universityId: investor.universityId,
        self: investor.id === DEMO_INVESTOR_ID,
      });
    }
  } else if (board === "club") {
    for (const row of clubStandings) {
      const club = clubById(row.clubId);
      if (!club) {
        missing += 1;
        continue;
      }
      rows.push({
        ...metrics(row),
        id: club.id,
        name: club.name,
        href: `/clubs/${club.id}`,
        affiliation: `${universityById(club.universityId)?.shortName ?? "University unavailable"} · ${row.eligibleMembers} eligible`,
        universityId: club.universityId,
        self: false,
      });
    }
  } else {
    for (const row of universityStandings) {
      const university = universityById(row.universityId);
      if (!university) {
        missing += 1;
        continue;
      }
      rows.push({
        ...metrics(row),
        id: university.id,
        name: university.name,
        href: `/universities/${university.id}`,
        affiliation: `${university.conference} · ${row.eligibleInvestors} eligible`,
        universityId: university.id,
        self: false,
      });
    }
  }
  return { rows, missing };
}

function metrics(row: Pick<Standing, "seasonReturn" | "roundReturn" | "score" | "riskAdjusted" | "drawdown" | "diversification" | "consistency" | "rank" | "previousRank">) {
  return {
    seasonReturn: row.seasonReturn,
    roundReturn: row.roundReturn,
    score: row.score,
    riskAdjusted: row.riskAdjusted,
    drawdown: row.drawdown,
    diversification: row.diversification,
    consistency: row.consistency,
    rank: row.rank,
    previousRank: row.previousRank,
  };
}

function compareRows(a: Row, b: Row, sort: SortKey, useRound: boolean): number {
  if (sort === "rank") return a.rank - b.rank;
  const left = sortValue(a, sort, useRound);
  const right = sortValue(b, sort, useRound);
  if (left === null && right === null) return a.rank - b.rank;
  if (left === null) return 1;
  if (right === null) return -1;
  const order = sort === "drawdown" ? Math.abs(left) - Math.abs(right) : right - left;
  return order === 0 ? a.rank - b.rank : order;
}

function sortValue(row: Row, sort: Exclude<SortKey, "rank">, useRound: boolean): number | null {
  if (sort === "return") return useRound ? row.roundReturn : row.seasonReturn;
  if (sort === "score") return row.score;
  if (sort === "riskAdjusted") return row.riskAdjusted;
  if (sort === "diversification") return row.diversification;
  if (sort === "drawdown") return row.drawdown;
  return row.consistency;
}
