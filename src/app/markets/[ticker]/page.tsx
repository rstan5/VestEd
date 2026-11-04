import Link from "next/link";
import { PriceLine } from "@/components/chart";
import { SecurityActions } from "@/components/markets/security-actions";
import { WatchlistProvider } from "@/components/markets/watchlist";
import { StatusNote, Tag } from "@/components/ui";
import { compactMoney, money, number, percent, signedMoney, tone } from "@/lib/format";
import { createMarketAdapter } from "@/lib/market/adapter";
import type { HistoryBar, MarketHeadline, MarketResult } from "@/lib/market/types";
import { loadSecurity, type SecurityStats } from "@/lib/market/views";
import { getWatchlistState } from "@/lib/watchlist/session";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const [view, watchlist] = await Promise.all([loadSecurity(createMarketAdapter(), decodeURIComponent(raw)), getWatchlistState()]);
  const profile = view.profile.status === "sample" ? view.profile.data : null;
  const quote = view.quote.status === "sample" ? view.quote.data : null;
  const stats = view.stats.status === "sample" ? view.stats.data : null;
  const ratio = stats?.changeRatio ? Number(stats.changeRatio) : null;

  return (
    <WatchlistProvider initial={watchlist}>
      <Link href="/markets" className="inline-flex items-center gap-1.5 text-sm text-quiet underline-offset-4 hover:text-forest hover:underline">
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M7.5 3 4.5 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        Markets
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm text-quiet">
            <span className="mono text-deep">{view.ticker}</span>
            {profile ? <span>{profile.type === "etf" ? "ETF" : "Stock"} · {profile.sector}</span> : null}
          </p>
          <h1 className="serif mt-1 text-[36px] leading-[1.1] text-forest md:text-[44px]">{profile?.name ?? quote?.name ?? view.ticker}</h1>
        </div>
        <div className="md:text-right" data-testid="security-price">
          {quote ? (
            <>
              <p className="serif text-[44px] leading-none tracking-tight text-deep">{money(Number(quote.price))}</p>
              <p className={`mono mt-2 text-sm ${ratio === null ? "text-quiet" : tone(ratio)}`}>
                {signedMoney(Number(quote.change))}
                {ratio === null ? null : ` (${percent(ratio, 2)})`} vs previous sample close
              </p>
            </>
          ) : (
            <p className="text-sm text-quiet">Quote unavailable</p>
          )}
        </div>
      </header>

      <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] leading-5 text-quiet" data-testid="security-honesty">
        {view.quote.status === "sample" ? <Tag kind="sample">Sample quote</Tag> : <Tag kind="unavailable">Unavailable</Tag>}
        <span>Not live or delayed vendor data. No vendor or quote time is attached.</span>
      </p>

      {view.quote.status === "unavailable" ? (
        <div className="mt-8">
          <StatusNote
            kind="unavailable"
            title={`${view.ticker} is unavailable`}
            body={view.quote.reason}
            action={<Link href="/markets" className="v-btn quiet small">Search Markets</Link>}
          />
        </div>
      ) : (
        <div className="mt-8">
          <SecurityActions ticker={view.ticker} tradable />
        </div>
      )}

      <div className="mt-12 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-12">
          <PriceChart ticker={view.ticker} history={view.history} />
          {profile ? (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-sm font-medium text-forest">About {view.ticker}</h2>
              <p className="mt-2 max-w-[640px] text-[15px] leading-7 text-ink">{profile.description}</p>
              <p className="mt-2 text-[12px] text-quiet">Sample description written for this build.</p>
            </section>
          ) : null}
        </div>
        <Statistics stats={view.stats} />
      </div>

      <TickerNews ticker={view.ticker} news={view.news} />
    </WatchlistProvider>
  );
}

function PriceChart({ ticker, history }: { ticker: string; history: MarketResult<HistoryBar[]> }) {
  const values = history.status === "sample" ? history.data.map((bar) => Number(bar.close)) : [];
  return (
    <section aria-labelledby="chart-heading" data-testid="security-chart">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chart-heading" className="text-sm font-medium text-forest">Price path</h2>
        {history.status === "sample" ? <Tag kind="sample">{values.length} sample bars</Tag> : <Tag kind="unavailable">Unavailable</Tag>}
      </div>
      <div className="mt-4">
        {history.status === "unavailable" ? (
          <StatusNote kind="unavailable" compact title="Chart unavailable" body={history.reason} />
        ) : values.length < 2 ? (
          <StatusNote kind="empty" compact title="Not enough bars to draw" body="The chart appears once at least two bars exist." />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <PriceLine values={values} label={`${ticker} sample path of ${values.length} bars from ${money(values[0])} to ${money(values[values.length - 1])}`} />
              <div className="mono flex flex-col justify-between py-1 text-right text-[11px] text-quiet" aria-hidden="true">
                <span>{money(Math.max(...values))}</span>
                <span>{money(Math.min(...values))}</span>
              </div>
            </div>
            <div className="mono mt-2 flex justify-between pr-16 text-[11px] text-quiet" aria-hidden="true">
              <span>Oldest bar</span>
              <span>Sample price</span>
            </div>
            <p className="mt-3 max-w-[640px] text-[13px] leading-5 text-quiet">
              An illustrative path that ends at the sample price. It is not a record of trading, and the bars carry no dates.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Statistics({ stats }: { stats: MarketResult<SecurityStats> }) {
  return (
    <section aria-labelledby="stats-heading" data-testid="security-stats" className="lg:pt-0.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="stats-heading" className="text-sm font-medium text-forest">Statistics</h2>
        {stats.status === "sample" ? <Tag kind="sample">Sample</Tag> : <Tag kind="unavailable">Unavailable</Tag>}
      </div>
      {stats.status === "unavailable" ? (
        <div className="mt-4">
          <StatusNote kind="unavailable" compact title="Statistics unavailable" body={stats.reason} />
        </div>
      ) : (
        <dl className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          <Stat label="Sample price" value={money(Number(stats.data.price))} />
          <Stat label="Previous sample close" value={money(Number(stats.data.previousClose))} />
          <Stat label="Change" value={stats.data.changeRatio === null ? signedMoney(Number(stats.data.change)) : `${signedMoney(Number(stats.data.change))} · ${percent(Number(stats.data.changeRatio), 2)}`} />
          <Stat label={`High, ${stats.data.bars} bars`} value={stats.data.rangeHigh === null ? "Unavailable" : money(Number(stats.data.rangeHigh))} />
          <Stat label={`Low, ${stats.data.bars} bars`} value={stats.data.rangeLow === null ? "Unavailable" : money(Number(stats.data.rangeLow))} />
          <Stat label="Volume" value={stats.data.volume === null ? "Unavailable" : number(Number(stats.data.volume))} />
          <Stat label="Market cap" value={stats.data.marketCap === null ? "Unavailable" : compactMoney(Number(stats.data.marketCap))} />
        </dl>
      )}
      <p className="mt-3 text-[12px] leading-5 text-quiet">Fixture figures for practice. They do not describe a real trading session.</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-quiet">{label}</dt>
      <dd className="mono text-right text-forest">{value}</dd>
    </div>
  );
}

function TickerNews({ ticker, news }: { ticker: string; news: MarketResult<MarketHeadline[]> }) {
  return (
    <section aria-labelledby="ticker-news-heading" className="mt-16 border-t border-rule pt-10" data-testid="security-news">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="ticker-news-heading" className="serif text-[28px] text-forest">Sample briefs on {ticker}</h2>
        {news.status === "sample" ? <Tag kind="sample">Written for this build</Tag> : <Tag kind="unavailable">Unavailable</Tag>}
      </div>
      <p className="mt-1 max-w-[640px] text-[13px] leading-5 text-quiet">Teaching notes, not a news wire. No publisher or publication time is attached.</p>
      <div className="mt-6">
        {news.status === "unavailable" ? (
          <StatusNote kind="unavailable" compact title="News unavailable" body={news.reason} />
        ) : news.data.length === 0 ? (
          <StatusNote kind="empty" compact title={`No sample brief mentions ${ticker}`} body="That is an empty desk, not a claim that nothing happened." />
        ) : (
          <ul className="max-w-[720px] divide-y divide-rule border-y border-rule">
            {news.data.map((item) => (
              <li key={item.id} className="py-5">
                <h3 className="serif text-xl leading-snug text-forest">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-quiet">{item.summary}</p>
                {item.tickers.length > 1 ? (
                  <p className="mt-2 flex flex-wrap gap-2 text-[12px]">
                    {item.tickers.filter((other) => other !== ticker).map((other) => (
                      <Link key={other} href={`/markets/${other}`} className="mono text-primary underline-offset-4 hover:underline">{other}</Link>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
