"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreBasisNote } from "@/components/score-basis";
import { LoadingBlock, Movement, Skeleton, StatusNote, Tag } from "@/components/ui";
import { useAccountState } from "@/lib/account/context";
import { MIN_CONSISTENCY_ROUNDS, MIN_DRAWDOWN_OBS, MIN_RISK_OBS, type Round } from "@/lib/domain";
import { applyWindow, sortBoard, type BoardSortKey, type BoardWindow, type WindowMetrics, type Windowed } from "@/lib/board";
import { buildRows, sampleBoardSources, serverWindowRows, type Board, type BoardIdentity } from "@/lib/board-rows";
import { percent, plainPercent, shortDate, tone } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio-state";
import { rounds as sampleRounds, seasonMeta, universities as sampleUniversities } from "@/lib/sample-data";
import { fetchServerStandings, type ServerStandingsState } from "@/lib/standings/client";
import type { LifetimeRecord } from "@/lib/standings/lifetime";
import type { ServerRound, StandingsPayload } from "@/lib/standings/load";

type SortKey = BoardSortKey;
type Period = "current" | "previous" | "lifetime";
type Row = Windowed<BoardIdentity>;
type FigureKey = Exclude<keyof WindowMetrics, "rank" | "previousRank">;

const boards: Array<{ id: Board; label: string; noun: string }> = [
  { id: "individual", label: "Students", noun: "students" },
  { id: "club", label: "Clubs", noun: "clubs" },
  { id: "university", label: "Universities", noun: "universities" },
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

const SAMPLE_PREVIOUS_YEAR = "2025–26";

type BoardView =
  | { kind: "loading" }
  | { kind: "note"; status: "empty" | "unavailable" | "error"; title: string; body: string }
  | { kind: "rows"; rows: Row[]; summary: string; tags: Array<{ kind: "sample" | "provisional" | "default"; label: string }>; missing: number }
  | { kind: "records"; records: LifetimeRecord[]; summary: string };

type RoundOption = { id: string; label: string };

/** Loads server standings for the signed-in profile. The result is keyed to the profile so a stale response is never shown. */
function useServerStandings(profileId: string | null): ServerStandingsState {
  const [loaded, setLoaded] = useState<{ key: string; state: ServerStandingsState } | null>(null);
  useEffect(() => {
    if (!profileId) return;
    const controller = new AbortController();
    void fetchServerStandings(controller.signal).then((state) => {
      if (!controller.signal.aborted) setLoaded({ key: profileId, state });
    });
    return () => controller.abort();
  }, [profileId]);
  if (!profileId) return { status: "signed-out" };
  return loaded && loaded.key === profileId ? loaded.state : { status: "loading" };
}

export default function LeaderboardPage() {
  const account = useAccountState();
  const server = useServerStandings(account.status === "signed-in" ? account.account.id : null);
  const { ready, standings } = usePortfolio();
  const [board, setBoard] = useState<Board>("individual");
  const [period, setPeriod] = useState<Period>("current");
  const [roundId, setRoundId] = useState("season");
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [compare, setCompare] = useState<string[]>([]);

  const payload = server.status === "ready" ? server.payload : null;
  const sampleMode = server.status === "signed-out";

  const sampleRound = sampleMode ? sampleRounds.find((item) => item.id === roundId) : undefined;
  const sampleWindow = useMemo<BoardWindow>(() => (sampleRound ? { kind: "round", round: sampleRound } : { kind: "season" }), [sampleRound]);
  const sample = useMemo(() => buildRows(board, sampleBoardSources(standings)), [board, standings]);

  const seasonLabel = payload ? payload.season?.name ?? "No season scheduled" : seasonMeta.name;
  const previousLabel = payload ? payload.previousYear.label : SAMPLE_PREVIOUS_YEAR;
  const periods: Array<{ value: Period; label: string }> = [
    { value: "current", label: seasonLabel },
    { value: "previous", label: `${previousLabel} academic year` },
    { value: "lifetime", label: "Lifetime records" },
  ];
  const roundOptions: RoundOption[] = payload
    ? payload.rounds.map((item) => ({ id: item.id, label: `${item.name} · ${serverRoundLabel(item)}` }))
    : sampleRounds.map((item) => ({ id: item.id, label: `${item.name} · ${roundStatusLabel(item)}` }));
  const universityOptions = payload
    ? payload.universities.map((item) => ({ value: item.id, label: item.shortName }))
    : sampleUniversities.map((item) => ({ value: item.id, label: item.shortName }));

  const view: BoardView = useMemo(() => {
    if (server.status === "loading" || (sampleMode && !ready)) return { kind: "loading" };
    if (server.status === "unavailable") return { kind: "note", status: "error", title: "Standings are unavailable", body: `${server.message} No ranks are shown rather than stale or invented ones.` };
    if (period === "previous") {
      const count = payload ? payload.previousYear.resultCount : 0;
      if (count === 0) {
        return {
          kind: "note",
          status: "empty",
          title: `No finalized results for the ${previousLabel} academic year`,
          body: "VestEd stores no finalized rounds from that year, so no champions, winners, or ranks are listed.",
        };
      }
      return { kind: "records", records: payload!.previousYear.records[board], summary: `${previousLabel} academic year · finalized rounds only` };
    }
    if (period === "lifetime") {
      const records = payload ? payload.lifetime[board] : [];
      if (records.length === 0) {
        return { kind: "note", status: "empty", title: "No lifetime records yet", body: "Lifetime records come only from finalized rounds. None have been finalized, so no career ranks are listed." };
      }
      return { kind: "records", records, summary: "All seasons · finalized rounds only" };
    }
    if (payload && server.status === "ready") return serverView(payload, server.viewerId, board, roundId);
    return sampleView(sample.rows, sample.missing, sampleWindow, sampleRound);
  }, [server, sampleMode, ready, period, payload, previousLabel, board, roundId, sample, sampleWindow, sampleRound]);

  const allRows = useMemo(() => (view.kind === "rows" ? view.rows : []), [view]);
  const needle = query.toLowerCase().trim();
  const rows = useMemo(() => {
    const visible = allRows
      .filter((row) => row.name.toLowerCase().includes(needle) || row.affiliation.toLowerCase().includes(needle))
      .filter((row) => university === "all" || row.universityId === university);
    return sortBoard(visible, sort);
  }, [allRows, needle, university, sort]);
  const records = view.kind === "records" ? view.records.filter((record) => record.name.toLowerCase().includes(needle)) : [];
  const selected = compare.map((id) => allRows.find((row) => row.id === id)).filter((row): row is Row => Boolean(row));
  const noun = boards.find((item) => item.id === board)?.noun ?? "entries";
  const useRound = roundId !== "season";

  function toggleCompare(id: string) {
    setCompare((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_COMPARE ? current : [...current, id]));
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-quiet">
            Compete {sampleMode ? <Tag kind="sample">Sample standings</Tag> : null}
          </p>
          <h1 className="serif mt-1 text-[40px] leading-none text-forest">Standings</h1>
        </div>
        <Methodology />
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="v-segment self-start" role="group" aria-label="Board">
            {boards.map((item) => (
              <button key={item.id} type="button" aria-pressed={board === item.id} onClick={() => { setBoard(item.id); setCompare([]); }}>
                {item.label}
              </button>
            ))}
          </div>
          {board !== "individual" ? <Tag>Equal-weight: each eligible student counts once</Tag> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)] lg:grid-cols-[200px_200px_minmax(0,1fr)_170px_170px]">
          <Select label="Season" value={period} onChange={(value) => { setPeriod(value as Period); setRoundId("season"); setCompare([]); }} options={periods} />
          <Select
            label="Round"
            value={roundId}
            onChange={(value) => { setRoundId(value); setCompare([]); }}
            disabled={period !== "current"}
            options={[{ value: "season", label: "Whole season" }, ...roundOptions.map((item) => ({ value: item.id, label: item.label }))]}
          />
          <label className="col-span-2 block md:col-span-1">
            <span className="text-[12px] text-quiet">Search</span>
            <input className="v-field mt-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${noun}`} />
          </label>
          <Select label="University" value={university} onChange={setUniversity} disabled={view.kind === "records"} options={[{ value: "all", label: "All universities" }, ...universityOptions]} />
          <Select label="Sort by" value={sort} onChange={(value) => setSort(value as SortKey)} disabled={view.kind === "records"} options={sorts.map((item) => ({ value: item.id, label: item.label }))} />
        </div>
      </div>

      <div className="mt-8">
        {view.kind === "loading" ? (
          <BoardLoading />
        ) : view.kind === "note" ? (
          <StatusNote kind={view.status} title={view.title} body={view.body} />
        ) : view.kind === "records" ? (
          <>
            <p className="mb-3 text-[13px] text-quiet">{records.length} of {view.records.length} {noun} · {view.summary}</p>
            {records.length === 0 ? <NoMatches onClear={() => setQuery("")} /> : <RecordsTable records={records} board={board} />}
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-quiet">
              <p>{rows.length} of {allRows.length} {noun} · {view.summary}</p>
              <span className="flex flex-wrap gap-2">
                {view.tags.map((tag) => <Tag key={tag.label} kind={tag.kind}>{tag.label}</Tag>)}
                <Tag kind="unavailable">Vs S&amp;P 500 unavailable</Tag>
              </span>
            </div>
            {view.missing > 0 ? (
              <div className="mb-3">
                <StatusNote kind="error" compact title={`${view.missing} ${view.missing === 1 ? "entry" : "entries"} could not be loaded`} body="Those rows are missing their profile record and are left out of this view. Official ranks of the other rows are unchanged." />
              </div>
            ) : null}
            {allRows.length === 0 ? (
              <StatusNote kind="empty" title={`No ${noun} on this board yet`} body={board === "individual" ? "No participating student has a published standing for this window." : "No group has eligible students with a published standing for this window."} />
            ) : rows.length === 0 ? (
              <NoMatches onClear={() => { setQuery(""); setUniversity("all"); }} />
            ) : (
              <BoardTable rows={rows} compare={compare} onToggle={toggleCompare} board={board} />
            )}
          </>
        )}
      </div>

      {view.kind === "rows" && allRows.length > 0 ? (
        <CompareTray rows={selected} onRemove={toggleCompare} onClear={() => setCompare([])} useRound={useRound} />
      ) : null}
    </div>
  );
}

function serverView(payload: StandingsPayload, viewerId: string, board: Board, roundId: string): BoardView {
  if (!payload.season) return { kind: "note", status: "empty", title: "No season is scheduled", body: "Standings appear once a season opens and its first end-of-day valuation is recorded." };
  const round = payload.rounds.find((item) => item.id === roundId);
  if (round?.status === "scheduled") {
    return { kind: "note", status: "empty", title: `${round.name} has not started`, body: `It opens ${shortDate(round.startsAt)}. Standings appear after its first end-of-day valuation.` };
  }
  const window = payload.windows[roundId];
  const rows = serverWindowRows(payload, board, roundId, viewerId);
  if (!window || !rows) {
    if (round?.status === "closing") {
      return { kind: "note", status: "unavailable", title: `${round.name} is being finalized`, body: `${round.name} closed ${shortDate(round.endsAt)}. Final standings appear once the server records the close.` };
    }
    return { kind: "note", status: "empty", title: "No standings published yet", body: "Provisional standings appear after the first end-of-day valuation of the window." };
  }
  const name = round ? `${round.name} window` : `${payload.season.name} season to date`;
  const status = window.kind === "final" ? "final" : "provisional";
  return {
    kind: "rows",
    rows,
    missing: 0,
    summary: `${name}, ${status} rank by return · as of ${shortDate(window.asOf)}`,
    tags: [window.kind === "final" ? { kind: "default", label: "Final" } : { kind: "provisional", label: "Provisional" }],
  };
}

function sampleView(baseRows: ReturnType<typeof buildRows>["rows"], missing: number, window: BoardWindow, round: Round | undefined): BoardView {
  if (round?.status === "scheduled") {
    return { kind: "note", status: "empty", title: `${round.name} has not started`, body: `It opens ${shortDate(`${round.start}T12:00:00.000Z`)}. Standings appear after its first end-of-day valuation.` };
  }
  const rows = applyWindow(baseRows, window);
  if (round && rows === null) {
    return {
      kind: "note",
      status: "unavailable",
      title: `${round.name} results are not loaded`,
      body: `${round.name} closed ${shortDate(round.end)} and is final, but this sample build has no stored round results to show. Sign in to see the server's standings.`,
    };
  }
  return {
    kind: "rows",
    rows: rows ?? [],
    missing,
    summary: `${round ? `${round.name} window, ${round.status === "live" ? "provisional " : ""}rank by round return` : "Season to date"} · as of ${shortDate(seasonMeta.asOf)}`,
    tags: round?.status === "final" ? [{ kind: "sample", label: "Sample round results, not finalized" }] : [],
  };
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StatusNote
      kind="empty"
      title="No matches"
      body="No entries match that search or filter. Official ranks do not change when you filter."
      action={<button type="button" className="v-btn quiet small" onClick={onClear}>Clear filters</button>}
    />
  );
}

function BoardTable({ rows, compare, onToggle, board }: { rows: Row[]; compare: string[]; onToggle: (id: string) => void; board: Board }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-rule bg-paper">
      <table className="v-table">
        <caption className="sr-only">Official standings for the selected window. The rank column is that window&apos;s official rank and does not change when you sort or filter.</caption>
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
            const checked = compare.includes(row.id);
            return (
              <tr key={row.id} data-self={row.self}>
                <td className="mono text-[15px] text-deep">
                  <RankCell row={row} />
                  <span className="mt-0.5 block text-[11px] md:hidden"><RankMove row={row} /></span>
                </td>
                <td className="hidden text-[13px] md:table-cell"><RankMove row={row} /></td>
                <td>
                  <span className="flex items-center gap-2">
                    {row.href ? <Link href={row.href} className="text-[15px] text-forest hover:underline">{row.name}</Link> : <span className="text-[15px] text-forest">{row.name}</span>}
                    {row.self ? <Tag kind="provisional">You</Tag> : null}
                  </span>
                  <span className="block text-[12px] text-quiet">{row.affiliation}</span>
                </td>
                <td className="num"><Stat row={row} field="return" render={(value) => percent(value)} toned /></td>
                <td className="num hidden md:table-cell"><ScoreStat row={row} /></td>
                <td className="num hidden lg:table-cell"><Stat row={row} field="riskAdjusted" render={(risk) => risk.toFixed(2)} /></td>
                <td className="num hidden md:table-cell"><Stat row={row} field="drawdown" render={(loss) => plainPercent(loss)} /></td>
                <td className="num hidden lg:table-cell"><Stat row={row} field="diversification" render={(score) => `${Math.round(score * 100)}`} /></td>
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

function RecordsTable({ records, board }: { records: LifetimeRecord[]; board: Board }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-rule bg-paper">
      <table className="v-table">
        <caption className="sr-only">Records built only from finalized rounds. Rank is the lifetime rank by mean finalized round return.</caption>
        <thead>
          <tr>
            <th className="w-[72px] text-left">Rank</th>
            <th className="text-left">{board === "individual" ? "Student" : board === "club" ? "Club" : "University"}</th>
            <th className="num">Mean round return</th>
            <th className="num">Finalized rounds</th>
            <th className="num hidden md:table-cell">Round wins</th>
            <th className="num hidden md:table-cell">Best rank</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.entrantId}>
              <td className="mono text-[15px] text-deep">{record.lifetimeRank ?? <span className="text-[12px] text-quiet">Unranked</span>}</td>
              <td className="text-[15px] text-forest">{record.name}</td>
              <td className={`num mono ${tone(record.meanReturn)}`}>{record.meanReturn === null ? <Insufficient /> : percent(record.meanReturn)}</td>
              <td className="num mono">{record.rounds}</td>
              <td className="num mono hidden md:table-cell">{record.wins}</td>
              <td className="num mono hidden md:table-cell">{record.bestRank ?? "—"}</td>
            </tr>
          ))}
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
              <CompareLine label="Official rank" rows={rows} render={(row) => <RankCell row={row} />} />
              <CompareLine label={useRound ? "Round return" : "Season return"} rows={rows} render={(row) => <Stat row={row} field="return" render={(value) => percent(value)} toned />} />
              <CompareLine label="Score" rows={rows} render={(row) => <ScoreStat row={row} />} />
              <CompareLine label="Risk-adjusted" rows={rows} render={(row) => <Stat row={row} field="riskAdjusted" render={(risk) => risk.toFixed(2)} />} />
              <CompareLine label="Drawdown" rows={rows} render={(row) => <Stat row={row} field="drawdown" render={(loss) => plainPercent(loss)} />} />
              <CompareLine label="Diversification" rows={rows} render={(row) => <Stat row={row} field="diversification" render={(score) => `${Math.round(score * 100)}`} />} />
              <CompareLine label="Consistency" rows={rows} render={(row) => <Stat row={row} field="consistency" render={(score) => `${Math.round(score * 100)}`} />} />
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
          <li>Score weights: return 30, risk-adjusted 20, drawdown 15, diversification 15, consistency 10, vs benchmark 10. Missing parts are dropped and the rest renormalized. A score with fewer than three parts reads Partial, and every score lists the parts it uses.</li>
          <li>Drawdown is the largest loss from a peak, shown as a positive number. A smaller loss ranks higher.</li>
          <li>Choosing a round ranks by that round&apos;s window. Statistics not stored for the round read Not enough data.</li>
          <li>Drawdown needs {MIN_DRAWDOWN_OBS} return intervals, risk-adjusted needs {MIN_RISK_OBS}, consistency needs {MIN_CONSISTENCY_ROUNDS} finalized rounds. Below that it reads Not enough data, not zero.</li>
          <li>Club and university figures are equal-weight averages of eligible students, so size alone does not help. A figure needs at least 3 eligible students, each with a value, or it reads Withheld.</li>
          <li>Benchmark-relative return is unavailable until a licensed S&amp;P 500 total-return series is connected.</li>
          <li>Finalized rounds are frozen. The live round is provisional until it closes. Lifetime records use finalized rounds only.</li>
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

function Withheld() {
  return <span className="text-[12px] text-quiet" title="Fewer than 3 eligible students, or a student without a value">Withheld</span>;
}

function Stat({ row, field, render, toned }: { row: Row; field: FigureKey; render: (value: number) => string; toned?: boolean }) {
  const value = row.window[field];
  if (value === null) return row.withheld?.includes(field) ? <Withheld /> : <Insufficient />;
  return <span className={`mono ${toned ? tone(value) : ""}`}>{render(value)}</span>;
}

function ScoreStat({ row }: { row: Row }) {
  return (
    <>
      <Stat row={row} field="score" render={(score) => score.toFixed(1)} />
      {row.window.score !== null ? <ScoreBasisNote basis={row.scoreBasis} /> : null}
    </>
  );
}

function RankCell({ row }: { row: Row }) {
  if (row.window.rank !== null) return <span className="mono">{row.window.rank}</span>;
  return row.withheld?.includes("return") ? <Withheld /> : <span className="text-[12px] text-quiet">Unranked</span>;
}

function RankMove({ row }: { row: Row }) {
  if (row.window.previousRank === null || row.window.rank === null) return <span className="text-muted">—</span>;
  return <Movement current={row.window.rank} previous={row.window.previousRank} />;
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

function serverRoundLabel(round: ServerRound): string {
  if (round.status === "final") return "Final";
  if (round.status === "live") return "Provisional";
  if (round.status === "closing") return "Closing";
  return "Scheduled";
}
