"use client";

import Link from "next/link";
import { QuietLine } from "@/components/chart";
import { LoadingBlock, Movement, Skeleton, StatusNote, Tag } from "@/components/ui";
import { useAccountState } from "@/lib/account/context";
import { firstName as firstNameOf } from "@/lib/account/types";
import { CASH_DRAG_THRESHOLD } from "@/lib/domain";
import { countdown, money, percent, plainPercent, shortDate, tone } from "@/lib/format";
import type { Book } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/portfolio-state";
import { currentRound, headlines, mayaSeries, seasonMeta } from "@/lib/sample-data";

export default function HomePage() {
  const { ready, book, standings, standing, seasonReturn } = usePortfolio();
  const accountState = useAccountState();
  const round = currentRound();

  if (accountState.status !== "signed-in") {
    return (
      <StatusNote
        kind="error"
        title="Your summary could not be loaded"
        body={accountState.status === "error" ? accountState.message : "Sign in to see your book and rank."}
        action={<Link href="/login" className="v-btn quiet small">Sign in</Link>}
      />
    );
  }
  if (!ready) return <HomeLoading />;

  const account = accountState.account;
  const firstName = firstNameOf(account.displayName);
  const official = standings.find((row) => row.investorId === standing.investorId);
  const action = account.onboarded
    ? nextAction(book, round.name, shortDate(round.end))
    : { title: "Finish setting up", body: "Add optional profile basics and choose how to continue. No club is needed.", href: "/onboarding", label: "Continue setup" };
  const points = mayaSeries.map((point) => ({ label: point.date, value: point.equity }));
  const holdingNews = headlines.find((item) => item.relevance === "holding");

  return (
    <div className="mx-auto max-w-[980px]">
      <header>
        <p className="text-sm text-quiet">{seasonMeta.name} · {round.name}</p>
        <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest md:text-[48px]">{account.onboarded ? "Welcome back" : "Welcome"}, {firstName}.</h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-quiet" data-testid="account-standing">
          <Tag>Individual account</Tag>
          <Tag kind="unavailable">University not verified</Tag>
          <span>No club needed to compete.</span>
          <Link href="/account/verification" className="text-primary underline-offset-4 hover:underline">Verify a university</Link>
        </p>
      </header>

      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="equity-label" className="lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-2">
            <h2 id="equity-label" className="text-sm text-quiet">Your book</h2>
            <Tag kind="sample">Sample</Tag>
          </div>
          <p className="serif mt-2 text-[56px] leading-none tracking-tight text-deep md:text-[64px]">{money(book.equity, 0)}</p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-quiet">Season</dt>
              <dd className={tone(seasonReturn)}>{percent(seasonReturn, 2)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-quiet">{round.name}</dt>
              <dd className={tone(standing.roundReturn)}>{percent(standing.roundReturn, 2)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-quiet">Cash</dt>
              <dd className="mono text-forest">{money(book.cash, 0)}</dd>
            </div>
          </dl>
        </section>

        <aside aria-labelledby="next-action" className="rounded-3xl bg-wash p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <p className="text-[12px] uppercase tracking-[0.08em] text-quiet">Next step</p>
          <h2 id="next-action" className="serif mt-2 text-2xl leading-snug text-forest">{action.title}</h2>
          <p className="mt-2 text-sm leading-6 text-quiet">{action.body}</p>
          <Link href={action.href} className="v-btn mt-6 w-full">{action.label}</Link>
        </aside>

        <section aria-labelledby="path-label" className="lg:col-start-1 lg:row-start-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="path-label" className="text-sm text-quiet">Season so far</h2>
            <span className="mono text-[12px] text-quiet">Sample path · as of {shortDate(seasonMeta.asOf)}</span>
          </div>
          <div className="mt-3">
            {points.length > 1 ? (
              <QuietLine points={points} label={`Sample equity path from ${money(points[0].value, 0)} to ${money(points[points.length - 1].value, 0)}`} />
            ) : (
              <StatusNote kind="empty" compact title="No valuations yet" body="Your line appears after the first end-of-day valuation." />
            )}
          </div>
          <p className="mt-3 text-[13px] leading-5 text-quiet">The sample path does not yet reconcile with the sample book above. The server ledger replaces both.</p>
          <p className="mt-2 text-[13px] leading-5 text-quiet">
            <Tag kind="unavailable">Benchmark unavailable</Tag>
            <span className="ml-2">No licensed S&amp;P 500 total-return series is connected, so no comparison line is drawn.</span>
          </p>
        </section>
      </div>

      <section aria-label="Round and rank" className="mt-12 rounded-2xl border border-rule bg-paper">
        <ul className="grid divide-y divide-rule md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:divide-x md:divide-y-0">
          <StripItem label={round.name}>
            <span className="flex flex-wrap items-center gap-2">
              <Tag kind="provisional">Provisional</Tag>
              <span className="text-sm text-forest">{countdown(round.end, new Date(seasonMeta.asOf))}</span>
            </span>
          </StripItem>
          <StripItem label="Your rank · sample book">
            {official ? (
              <span className="flex items-baseline gap-2">
                <span className="mono text-xl text-deep">#{official.rank}</span>
                <span className="text-[13px]"><Movement current={official.rank} previous={official.previousRank} /></span>
                <span className="text-[13px] text-quiet">of {standings.length}</span>
              </span>
            ) : (
              <span className="text-sm text-quiet">Unavailable</span>
            )}
          </StripItem>
          <StripItem label="Club">
            <span className="text-sm text-quiet">Not in a club · competing as an individual</span>
          </StripItem>
          <StripItem label="University">
            <Link href="/account/verification" className="text-sm text-quiet underline-offset-4 hover:underline">Not verified</Link>
          </StripItem>
          <li className="flex items-center px-5 py-4">
            <Link href="/competition" className="text-sm text-primary underline-offset-4 hover:underline">Standings →</Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="also" className="mt-14">
        <h2 id="also" className="text-sm text-quiet">Also this week</h2>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {holdingNews ? (
            <AlsoRow href="/research" title={holdingNews.title} meta={`${holdingNews.tickers.join(", ")} · ${holdingNews.publisher}`} tag={<Tag kind="sample">Sample news</Tag>} />
          ) : null}
          <AlsoRow
            href="/professor"
            title={book.positions[0] ? `Ask why ${book.positions[0].ticker} is ${plainPercent(book.positions[0].weight, 0)} of your book` : "Ask the Professor how to start a first position"}
            meta="Professor"
            tag={<Tag kind="unavailable">Demonstration only</Tag>}
          />
        </ul>
      </section>
    </div>
  );
}

function nextAction(book: Book, roundName: string, closes: string): { title: string; body: string; href: string; label: string } {
  if (book.positions.length === 0) {
    return { title: "Make your first trade", body: "Your book is all cash. Pick one company you can explain in a sentence.", href: "/portfolio", label: "Open Portfolio" };
  }
  const cashWeight = book.equity === 0 ? 0 : book.cash / book.equity;
  if (cashWeight > CASH_DRAG_THRESHOLD) {
    return { title: `${plainPercent(cashWeight, 0)} of your book is cash`, body: "Cash above 20% lowers the diversification component of your score.", href: "/portfolio", label: "Review your book" };
  }
  const top = book.positions[0];
  if (top && top.weight > 0.25) {
    return { title: `${top.ticker} is ${plainPercent(top.weight, 0)} of your book`, body: "One position that large drives most of your drawdown risk.", href: "/portfolio", label: "Review your book" };
  }
  return { title: `${roundName} closes ${closes}`, body: "Check your holdings before the close. Finalized rounds do not change afterward.", href: "/portfolio", label: "Review your book" };
}

function StripItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 px-5 py-4">
      <span className="text-[12px] text-quiet">{label}</span>
      {children}
    </li>
  );
}

function AlsoRow({ href, title, meta, tag }: { href: string; title: string; meta: string; tag: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex flex-col gap-1 py-4 hover:bg-wash md:flex-row md:items-center md:justify-between md:gap-6 md:px-2">
        <span>
          <span className="block text-[15px] text-forest">{title}</span>
          <span className="text-[13px] text-quiet">{meta}</span>
        </span>
        {tag}
      </Link>
    </li>
  );
}

function HomeLoading() {
  return (
    <LoadingBlock label="Loading your summary">
      <div className="mx-auto max-w-[980px]">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-12 w-80 max-w-full" />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <Skeleton className="h-16 w-64" />
            <Skeleton className="mt-8 h-[160px] w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="mt-12 h-20 w-full" />
      </div>
    </LoadingBlock>
  );
}
