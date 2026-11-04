import Link from "next/link";
import { MarketSearch } from "@/components/markets/search";
import { WatchButton, WatchlistProvider, WatchlistPanel } from "@/components/markets/watchlist";
import { StatusNote, Tag } from "@/components/ui";
import { money, percent, tone } from "@/lib/format";
import { createMarketAdapter } from "@/lib/market/adapter";
import type { MarketHeadline, MarketResult } from "@/lib/market/types";
import { loadDiscovery, parseQuery, parseTypeFilter, type DiscoveryView, type MarketRow } from "@/lib/market/views";
import { getWatchlistState } from "@/lib/watchlist/session";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function MarketsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = parseQuery(first(params.q));
  const type = parseTypeFilter(first(params.type));
  const watchlist = await getWatchlistState();
  const view = await loadDiscovery(createMarketAdapter(), {
    query,
    type,
    watchlist: watchlist.status === "ready" ? watchlist.tickers : [],
  });
  const here = `/markets${query || type !== "all" ? `?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(type !== "all" ? { type } : {}) })}` : ""}`;

  return (
    <WatchlistProvider initial={watchlist}>
      <header className="max-w-[720px]">
        <p className="text-sm text-quiet">US stocks and ETFs</p>
        <h1 className="serif mt-1 text-[40px] leading-none text-forest md:text-[48px]">Markets</h1>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm leading-6 text-quiet" data-testid="market-honesty">
          <Tag kind="sample">Sample data</Tag>
          <span>Not live or delayed. No market data license is connected, so prices, charts, and briefs are fixtures written for this build, with no vendor or quote time.</span>
        </p>
      </header>

      <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="search-heading" className="min-w-0">
          <h2 id="search-heading" className="sr-only">Search</h2>
          <MarketSearch query={query} type={type}>
            <Results view={view} next={here} />
          </MarketSearch>
        </section>
        <aside aria-labelledby="watchlist-heading" className="lg:pt-1">
          <WatchlistPanel directory={view.directory} />
        </aside>
      </div>

      <NewsDesk news={view.news} />
    </WatchlistProvider>
  );
}

function Results({ view, next }: { view: DiscoveryView; next: string }) {
  if (view.results.status === "unavailable") {
    return <StatusNote kind="unavailable" title="Search unavailable" body={view.results.reason} />;
  }
  const rows = view.results.rows;
  if (rows.length === 0) {
    return (
      <StatusNote
        kind="empty"
        title={view.query ? `No stock or ETF matches “${view.query}”` : "No listings of this type"}
        body="The sample universe is a short list of US stocks and ETFs. Try a ticker such as MSFT or a name such as Vanguard."
        action={<Link href="/markets" className="v-btn quiet small">Clear search</Link>}
      />
    );
  }
  return (
    <div data-testid="search-results">
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-quiet">
        <span><span className="mono text-forest">{rows.length}</span> {rows.length === 1 ? "listing" : "listings"}{view.query ? <> for “{view.query}”</> : null}</span>
        <Tag kind="sample">Sample quotes</Tag>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="v-table">
          <thead>
            <tr>
              <th className="text-left">Symbol</th>
              <th className="hidden text-left md:table-cell">Type</th>
              <th className="hidden text-left lg:table-cell">Sector</th>
              <th className="num"><span className="sm:hidden">Price</span><span className="hidden sm:inline">Sample price</span></th>
              <th className="num hidden sm:table-cell">Change</th>
              <th><span className="sr-only">Watchlist</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ResultRow key={row.ticker} row={row} next={next} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultRow({ row, next }: { row: MarketRow; next: string }) {
  const quote = row.quote.status === "sample" ? row.quote.data : null;
  const ratio = quote && Number(quote.previousClose) > 0 ? Number(quote.change) / Number(quote.previousClose) : null;
  return (
    <tr>
      <td>
        <Link href={`/markets/${row.ticker}`} className="group block">
          <span className="mono text-[15px] text-deep group-hover:underline">{row.ticker}</span>
          <span className="block max-w-[140px] truncate text-[12px] text-quiet sm:max-w-none">{row.listing?.name ?? "Listing unavailable"}</span>
        </Link>
      </td>
      <td className="hidden text-quiet md:table-cell">{row.listing?.type === "etf" ? "ETF" : "Stock"}</td>
      <td className="hidden text-quiet lg:table-cell">{row.listing?.sector}</td>
      <td className="num mono">
        {quote ? money(Number(quote.price)) : <span className="text-quiet">Unavailable</span>}
        {ratio !== null ? <span className={`block text-[12px] sm:hidden ${tone(ratio)}`}>{percent(ratio, 2)}</span> : null}
      </td>
      <td className={`num mono hidden sm:table-cell ${ratio === null ? "text-quiet" : tone(ratio)}`}>{ratio === null ? "Unavailable" : percent(ratio, 2)}</td>
      <td className="text-right">
        <WatchButton ticker={row.ticker} next={next} />
      </td>
    </tr>
  );
}

function NewsDesk({ news }: { news: MarketResult<MarketHeadline[]> }) {
  return (
    <section aria-labelledby="news-heading" className="mt-16 border-t border-rule pt-10" data-testid="market-news">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="news-heading" className="serif text-[28px] text-forest">Sample briefs</h2>
        <Tag kind="sample">Written for this build</Tag>
      </div>
      <p className="mt-1 max-w-[640px] text-[13px] leading-5 text-quiet">
        These are teaching notes, not a news wire. No publisher or publication time is attached, because none exists.
      </p>
      <div className="mt-6">
        {news.status === "unavailable" ? (
          <StatusNote kind="unavailable" compact title="News unavailable" body={news.reason} />
        ) : news.data.length === 0 ? (
          <StatusNote kind="empty" compact title="No briefs yet" body="Nothing is in the sample desk right now." />
        ) : (
          <ul className="grid gap-x-12 md:grid-cols-2">
            {news.data.map((item) => (
              <li key={item.id} className="border-b border-rule py-5">
                <p className="flex flex-wrap gap-2 text-[12px]">
                  {item.tickers.map((ticker) => (
                    <Link key={ticker} href={`/markets/${ticker}`} className="mono text-primary underline-offset-4 hover:underline">{ticker}</Link>
                  ))}
                </p>
                <h3 className="serif mt-1.5 text-xl leading-snug text-forest">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-quiet">{item.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
