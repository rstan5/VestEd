"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AllocationBar } from "@/components/chart";
import { TradeSheet } from "@/components/ticket";
import { LoadingBlock, Skeleton, StatusNote, Tag } from "@/components/ui";
import { useAccountState } from "@/lib/account/context";
import { STARTING_CAPITAL, type Order } from "@/lib/domain";
import { dateTime, money, percent, plainPercent, shortDate, signedMoney, tone } from "@/lib/format";
import { studentDomainBook, type StudentLedgerState } from "@/lib/ledger/client";
import type { LedgerBook, LedgerOrder, LedgerOrderStatus } from "@/lib/ledger/types";
import { sectorWeights, type Book } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/portfolio-state";
import { rounds, seasonMeta, securities } from "@/lib/sample-data";

type Tab = "holdings" | "orders" | "activity";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "holdings", label: "Holdings" },
  { id: "orders", label: "Orders" },
  { id: "activity", label: "Activity" },
];

export default function PortfolioPage() {
  const accountState = useAccountState();
  const { student } = usePortfolio();
  if (accountState.status === "signed-in") return <StudentPortfolio student={student} />;
  return <SamplePortfolio />;
}

/** The signed-in student's own server book, keyed to their profile id. Never the sample book. */
function StudentPortfolio({ student }: { student: StudentLedgerState }) {
  const [tab, setTab] = useState<Tab>("holdings");
  const [sheet, setSheet] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  if (student.status === "loading" || student.status === "signed-out") {
    return (
      <div>
        <PortfolioHeader season={`${seasonMeta.name} book`} onTrade={() => {}} disabled />
        <PortfolioLoading />
      </div>
    );
  }
  if (student.status === "unavailable") {
    return (
      <div>
        <PortfolioHeader season="Your book" onTrade={() => {}} disabled />
        <div className="mt-8">
          <StatusNote kind="error" title="Your book could not be loaded" body={student.message} />
        </div>
      </div>
    );
  }

  const ledgerBook = student.book;
  const valuation = student.valuation;
  const book = studentDomainBook(valuation);
  const seasonReturn = valuation.seasonReturn === null ? null : Number(valuation.seasonReturn);
  const openOrders = ledgerBook.orders.filter((order) => order.status === "accepted");
  const openSheet = (ticker?: string) =>
    setSheet(ticker ?? book?.positions[0]?.ticker ?? ledgerBook.instruments[0]?.id ?? null);
  const counts: Record<Tab, number> = {
    holdings: ledgerBook.positions.length,
    orders: ledgerBook.orders.length,
    activity: ledgerBook.cashLines.length,
  };

  return (
    <div>
      <PortfolioHeader season={`${ledgerBook.seasonName} book`} onTrade={() => openSheet()} disabled={ledgerBook.instruments.length === 0} />

      {book ? (
        <LedgerSummary book={book} seasonReturn={seasonReturn} />
      ) : (
        <div className="mt-8">
          <StatusNote kind="unavailable" title="Valuation unavailable" body="A holding has no stored quote, so equity is not shown. Cash and orders below are still exact." />
        </div>
      )}

      <section aria-labelledby="allocation" className="mt-8">
        <h2 id="allocation" className="sr-only">Allocation</h2>
        {book && book.equity > 0 ? (
          <AllocationBar items={sectorWeights(book).map((sector) => ({ label: sector.sector, weight: sector.weight }))} cash={book.cash / book.equity} />
        ) : (
          <StatusNote kind="unavailable" compact title="Allocation unavailable" body="The book has no valuation yet." />
        )}
      </section>

      <div className="mt-10 border-b border-rule">
        <div role="tablist" aria-label="Ledger" className="-mb-px flex gap-6">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`border-b-2 pb-3 text-[15px] transition-colors ${tab === item.id ? "border-forest font-medium text-deep" : "border-transparent text-quiet hover:text-forest"}`}
            >
              {item.label}
              <span className="mono ml-2 text-[12px] text-quiet">{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-2">
        {tab === "holdings" ? (
          book ? (
            <Holdings book={book} onTrade={openSheet} onNewTrade={() => openSheet()} />
          ) : (
            <div className="pt-6">
              <StatusNote kind="unavailable" compact title="Holdings cannot be valued" body="At least one position has no stored quote." />
            </div>
          )
        ) : null}
        {tab === "orders" ? <StudentOrders book={ledgerBook} open={openOrders} onTrade={() => openSheet()} /> : null}
        {tab === "activity" ? <StudentActivity book={ledgerBook} /> : null}
      </div>

      {sheet ? <TradeSheet key={sheet} initialTicker={sheet} onClose={closeSheet} /> : null}
    </div>
  );
}

/** The signed-out demo, still on the labeled sample book. */
function SamplePortfolio() {
  const { ready, book, ledger, seasonReturn } = usePortfolio();
  const [tab, setTab] = useState<Tab>("holdings");
  const [sheet, setSheet] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const openSheet = (ticker?: string) => setSheet(ticker ?? book.positions[0]?.ticker ?? securities[0].ticker);

  return (
    <div>
      <PortfolioHeader season={`${seasonMeta.name} book`} onTrade={() => openSheet()} disabled={!ready} sample />

      {!ready ? (
        <PortfolioLoading />
      ) : (
        <>
          <LedgerSummary book={book} seasonReturn={seasonReturn} />

          <section aria-labelledby="allocation" className="mt-8">
            <h2 id="allocation" className="sr-only">Allocation</h2>
            {book.equity > 0 ? (
              <AllocationBar items={sectorWeights(book).map((sector) => ({ label: sector.sector, weight: sector.weight }))} cash={book.cash / book.equity} />
            ) : (
              <StatusNote kind="unavailable" compact title="Allocation unavailable" body="The book has no valuation yet." />
            )}
          </section>

          <div className="mt-10 border-b border-rule">
            <div role="tablist" aria-label="Ledger" className="-mb-px flex gap-6">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === item.id}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => setTab(item.id)}
                  className={`border-b-2 pb-3 text-[15px] transition-colors ${tab === item.id ? "border-forest font-medium text-deep" : "border-transparent text-quiet hover:text-forest"}`}
                >
                  {item.label}
                  <span className="mono ml-2 text-[12px] text-quiet">{item.id === "holdings" ? book.positions.length : item.id === "orders" ? ledger.orders.length : ledger.orders.length + 1}</span>
                </button>
              ))}
            </div>
          </div>

          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-2">
            {tab === "holdings" ? <Holdings book={book} onTrade={openSheet} onNewTrade={() => openSheet(securities[0].ticker)} /> : null}
            {tab === "orders" ? <SampleOrders orders={ledger.orders} onTrade={() => openSheet()} /> : null}
            {tab === "activity" ? <SampleActivity orders={ledger.orders} /> : null}
          </div>
        </>
      )}

      {sheet ? <TradeSheet key={sheet} initialTicker={sheet} onClose={closeSheet} /> : null}
    </div>
  );
}

function PortfolioHeader({ season, onTrade, disabled, sample = false }: { season: string; onTrade: () => void; disabled: boolean; sample?: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-sm text-quiet">
          {season} <Tag kind="sample">{sample ? "Sample book" : "Sample quotes"}</Tag>
        </p>
        <h1 className="serif mt-1 text-[40px] leading-none text-forest">Portfolio</h1>
      </div>
      <button type="button" className="v-btn" onClick={onTrade} disabled={disabled}>
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        Trade
      </button>
    </header>
  );
}

function LedgerSummary({ book, seasonReturn }: { book: Book; seasonReturn: number | null }) {
  const items = [
    { label: "Equity", value: money(book.equity), detail: seasonReturn === null ? <span className="text-quiet">Season unavailable</span> : <span className={tone(seasonReturn)}>{percent(seasonReturn, 2)} season</span> },
    { label: "Cash", value: money(book.cash), detail: <span className="text-quiet">{book.equity ? plainPercent(book.cash / book.equity) : "Unavailable"} of equity</span> },
    { label: "Invested", value: money(book.invested), detail: <span className="text-quiet">{book.positions.length} positions</span> },
    { label: "Unrealized", value: signedMoney(book.unrealized), detail: <span className="text-quiet">Open positions</span> },
    { label: "Realized", value: signedMoney(book.realized), detail: <span className="text-quiet">Closed this season</span> },
  ];
  return (
    <dl className="mt-8 grid grid-cols-2 gap-y-6 border-y border-rule py-5 md:grid-cols-5 md:divide-x md:divide-rule">
      {items.map((item) => (
        <div key={item.label} className="md:px-5 md:first:pl-0">
          <dt className="text-[12px] text-quiet">{item.label}</dt>
          <dd className="mono mt-1 text-[17px] text-deep">{item.value}</dd>
          <dd className="mt-0.5 text-[12px]">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function Holdings({ book, onTrade, onNewTrade }: { book: Book; onTrade: (ticker: string) => void; onNewTrade: () => void }) {
  if (book.positions.length === 0) {
    return (
      <div className="pt-6">
        <StatusNote kind="empty" title="No holdings yet" body="Your book is all cash. Open the trade sheet to buy from the listed stocks and ETFs." action={<button type="button" className="v-btn" onClick={onNewTrade}>Trade</button>} />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="v-table">
        <thead>
          <tr>
            <th className="text-left">Symbol</th>
            <th className="num hidden sm:table-cell">Shares</th>
            <th className="num hidden md:table-cell">Avg cost</th>
            <th className="num hidden md:table-cell">Price</th>
            <th className="num">Value</th>
            <th className="num">Return</th>
            <th className="num hidden lg:table-cell">Weight</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {book.positions.map((position) => (
            <tr key={position.ticker}>
              <td>
                <Link href={`/markets/${position.ticker}`} className="mono text-[15px] text-deep hover:underline">{position.ticker}</Link>
                <div className="max-w-[160px] truncate text-[12px] text-quiet md:max-w-none">{position.name}</div>
              </td>
              <td className="num mono hidden sm:table-cell">{position.quantity}</td>
              <td className="num mono hidden md:table-cell">{money(position.averageCost)}</td>
              <td className="num mono hidden md:table-cell">{money(position.price)}</td>
              <td className="num mono">{money(position.marketValue, 0)}</td>
              <td className={`num mono ${tone(position.returnPct)}`}>{percent(position.returnPct)}</td>
              <td className="num mono hidden lg:table-cell">{plainPercent(position.weight)}</td>
              <td className="text-right">
                <button type="button" className="v-btn quiet small" onClick={() => onTrade(position.ticker)} aria-label={`Trade ${position.ticker}`}>Trade</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const orderTag: Record<LedgerOrderStatus, { kind: "provisional" | "error" | "default"; label: string }> = {
  accepted: { kind: "provisional", label: "Queued" },
  filled: { kind: "provisional", label: "Filled" },
  rejected: { kind: "error", label: "Rejected" },
  cancelled: { kind: "default", label: "Cancelled" },
  expired: { kind: "default", label: "Expired" },
};

function StudentOrders({ book, open, onTrade }: { book: LedgerBook; open: LedgerOrder[]; onTrade: () => void }) {
  const { cancelOrder } = usePortfolio();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const history = book.orders.filter((order) => order.status !== "accepted");

  async function cancel(orderId: string) {
    setCancelling(orderId);
    setCancelError(null);
    const result = await cancelOrder(orderId);
    if (!result.ok) setCancelError(result.message);
    setCancelling(null);
  }

  return (
    <div className="space-y-10 pt-6">
      <section aria-labelledby="open-orders">
        <h2 id="open-orders" className="text-sm font-medium text-forest">Open orders</h2>
        {cancelError ? (
          <p className="mt-3 rounded-xl border border-[#efd2cc] bg-loss-soft px-4 py-3 text-sm text-loss" role="alert">{cancelError}</p>
        ) : null}
        {open.length === 0 ? (
          <div className="mt-3">
            <StatusNote kind="empty" compact title="No open orders" body="Accepted orders wait here until they fill, expire at the close, or you cancel them." />
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th className="text-left">Submitted</th>
                  <th className="text-left">Order</th>
                  <th className="hidden text-left md:table-cell">Eligible</th>
                  <th className="hidden text-left lg:table-cell">Expires</th>
                  <th className="num">Reserve</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {open.map((order) => (
                  <tr key={order.id}>
                    <td className="mono text-[13px] text-quiet">{dateTime(order.acceptedAt)}</td>
                    <td><span className="capitalize">{order.side}</span> <span className="mono">{order.quantity} {order.instrumentId}</span></td>
                    <td className="mono hidden text-[13px] text-quiet md:table-cell">{dateTime(order.eligibleAt)}</td>
                    <td className="mono hidden text-[13px] text-quiet lg:table-cell">{dateTime(order.expiresAt)}</td>
                    <td className="num mono">{order.reservation ? (order.reservation.kind === "cash" ? money(Number(order.reservation.amount)) : `${order.reservation.amount} sh`) : "—"}</td>
                    <td className="text-right">
                      <button type="button" className="v-btn quiet small" disabled={cancelling === order.id} onClick={() => void cancel(order.id)}>
                        {cancelling === order.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="order-history">
        <h2 id="order-history" className="text-sm font-medium text-forest">History</h2>
        {history.length === 0 ? (
          <div className="mt-3">
            <StatusNote kind="empty" compact title="No orders this season" body="Orders you place appear here, including rejected ones." action={<button type="button" className="v-btn quiet small" onClick={onTrade}>Trade</button>} />
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th className="text-left">Submitted</th>
                  <th className="text-left">Order</th>
                  <th className="num">Fill</th>
                  <th className="text-left">Status</th>
                  <th className="hidden text-left lg:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((order) => (
                  <tr key={order.id}>
                    <td className="mono text-[13px] text-quiet">{dateTime(order.acceptedAt)}</td>
                    <td><span className="capitalize">{order.side}</span> <span className="mono">{order.quantity} {order.instrumentId}</span></td>
                    <td className="num mono">{order.execution ? money(Number(order.execution.price)) : <span className="text-quiet">Not filled</span>}</td>
                    <td><Tag kind={orderTag[order.status].kind}>{orderTag[order.status].label}</Tag></td>
                    <td className="hidden max-w-[320px] text-[13px] leading-5 text-quiet lg:table-cell">{order.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StudentActivity({ book }: { book: LedgerBook }) {
  const lines = [...book.cashLines].reverse();
  if (lines.length === 0) {
    return (
      <div className="pt-6">
        <StatusNote kind="empty" compact title="No activity yet" body="Cash movements appear here as orders settle." />
      </div>
    );
  }
  return (
    <ol className="divide-y divide-rule pt-2">
      {lines.map((line) => (
        <li key={line.id} className="grid grid-cols-[72px_1fr] gap-4 py-4 md:grid-cols-[120px_1fr_auto]">
          <span className="mono pt-0.5 text-[13px] text-quiet">{shortDate(line.createdAt)}</span>
          <div>
            <p className="text-[15px] text-forest">{line.memo}</p>
            <p className="mt-0.5 text-[13px] text-quiet">{dateTime(line.createdAt)}</p>
          </div>
          <span className={`mono col-start-2 text-[15px] md:col-start-auto ${tone(Number(line.amount))}`}>{signedMoney(Number(line.amount))}</span>
        </li>
      ))}
    </ol>
  );
}

function SampleOrders({ orders, onTrade }: { orders: Order[]; onTrade: () => void }) {
  return (
    <div className="space-y-10 pt-6">
      <section aria-labelledby="open-orders">
        <h2 id="open-orders" className="text-sm font-medium text-forest">Open orders</h2>
        <div className="mt-3">
          <StatusNote
            kind="empty"
            compact
            title="No open orders"
            body="This sample build fills orders right away, so nothing waits here. Sign in to place orders on your own server book."
          />
        </div>
      </section>
      <section aria-labelledby="order-history">
        <h2 id="order-history" className="text-sm font-medium text-forest">History</h2>
        {orders.length === 0 ? (
          <div className="mt-3">
            <StatusNote kind="empty" compact title="No orders this season" body="Orders you place appear here, including rejected ones." action={<button type="button" className="v-btn quiet small" onClick={onTrade}>Trade</button>} />
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th className="text-left">Submitted</th>
                  <th className="text-left">Order</th>
                  <th className="num">Fill</th>
                  <th className="text-left">Status</th>
                  <th className="hidden text-left lg:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono text-[13px] text-quiet">{dateTime(order.submittedAt)}</td>
                    <td><span className="capitalize">{order.side}</span> <span className="mono">{order.quantity} {order.ticker}</span></td>
                    <td className="num mono">{order.fillPrice === null ? <span className="text-quiet">Not filled</span> : money(order.fillPrice)}</td>
                    <td>{order.status === "filled" ? <Tag kind="provisional">Filled</Tag> : <Tag kind="error">Rejected</Tag>}</td>
                    <td className="hidden max-w-[320px] text-[13px] leading-5 text-quiet lg:table-cell">{order.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SampleActivity({ orders }: { orders: Order[] }) {
  const seasonStart = rounds[0]?.start;
  return (
    <ol className="divide-y divide-rule pt-2">
      {orders.map((order) => (
        <li key={order.id} className="grid grid-cols-[72px_1fr] gap-4 py-4 md:grid-cols-[120px_1fr_auto]">
          <span className="mono pt-0.5 text-[13px] text-quiet">{shortDate(order.submittedAt)}</span>
          <div>
            <p className="text-[15px] text-forest">
              {order.status === "filled"
                ? `${order.side === "buy" ? "Bought" : "Sold"} ${order.quantity} ${order.ticker} at ${money(order.fillPrice ?? 0)}`
                : `${order.side === "buy" ? "Buy" : "Sell"} ${order.quantity} ${order.ticker} rejected`}
            </p>
            <p className="mt-0.5 text-[13px] text-quiet">{order.status === "filled" ? (order.side === "buy" ? "Cash debited, shares added." : "Shares removed, cash credited.") : `No cash or shares moved. ${order.reason}`}</p>
          </div>
          <span className="col-start-2 md:col-start-auto">{order.status === "filled" ? <Tag kind="sample">Sample fill</Tag> : <Tag kind="error">Rejected</Tag>}</span>
        </li>
      ))}
      <li className="grid grid-cols-[72px_1fr] gap-4 py-4 md:grid-cols-[120px_1fr_auto]">
        <span className="mono pt-0.5 text-[13px] text-quiet">{seasonStart ? shortDate(seasonStart) : "Unavailable"}</span>
        <div>
          <p className="text-[15px] text-forest">Season opened with {money(STARTING_CAPITAL)} in virtual cash</p>
          <p className="mt-0.5 text-[13px] text-quiet">Earlier sample fills that built this book are not itemized in this build.</p>
        </div>
        <span className="col-start-2 md:col-start-auto"><Tag kind="sample">Sample</Tag></span>
      </li>
    </ol>
  );
}

function PortfolioLoading() {
  return (
    <LoadingBlock label="Loading your book">
      <div className="mt-8 grid grid-cols-2 gap-6 border-y border-rule py-5 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
      </div>
      <Skeleton className="mt-8 h-2.5 w-full" />
      <div className="mt-12 space-y-3">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-11 w-full" />)}
      </div>
    </LoadingBlock>
  );
}
