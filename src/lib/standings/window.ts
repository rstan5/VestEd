import type { HoldingWeight, ValuationPoint } from "@/lib/scoring";

/** A stored valuation snapshot. Money stays a decimal string until it reaches the formula. */
export type StoredSnapshot = {
  valuedAt: string;
  status: "valued" | "unavailable";
  equity: string | null;
  cash: string;
  holdings: Array<{ sector: string | null; value: string }>;
};

export type BookHistory = {
  registeredAt: string;
  startingCapital: string;
  /** Execution times. A fill after the last known valuation makes that valuation stale as a window base or close. */
  executedAt: string[];
  snapshots: StoredSnapshot[];
};

export type WindowPath = {
  participated: boolean;
  points: ValuationPoint[] | null;
  holdings: HoldingWeight[] | null;
  cashWeight: number | null;
};

type Known = { at: number; equity: number; cash: number; holdings: StoredSnapshot["holdings"] };

const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The valuation path for one window. Season capital is the only external funding and lands at
 * registration, so the registration credit is the first known valuation. A round window starts
 * from the last known valuation at or before its open. Snapshots are reduced to the last one per
 * New York session date, so intervals are daily however often the job runs. When the latest snapshot
 * at the close is unavailable, or a known fill inside the window came after it, the whole window is
 * unavailable rather than valued at stale or zero equity.
 */
export function windowPath(history: BookHistory, window: { start: string | null; end: string }): WindowPath {
  const registeredAt = Date.parse(history.registeredAt);
  const start = window.start === null ? registeredAt : Date.parse(window.start);
  const end = Date.parse(window.end);
  if (registeredAt > start || registeredAt > end) return { participated: false, points: null, holdings: null, cashWeight: null };

  const unavailable: WindowPath = { participated: true, points: null, holdings: null, cashWeight: null };
  const capital = Number(history.startingCapital);
  const snapshots = [...history.snapshots]
    .map((item) => ({ ...item, at: Date.parse(item.valuedAt) }))
    .filter((item) => item.at >= registeredAt && item.at <= end)
    .sort((a, b) => a.at - b.at);
  const known = (item: (typeof snapshots)[number]): Known | null =>
    item.status === "valued" && item.equity !== null ? { at: item.at, equity: Number(item.equity), cash: Number(item.cash), holdings: item.holdings } : null;

  let base: Known = { at: registeredAt, equity: capital, cash: capital, holdings: [] };
  const beforeStart = snapshots.filter((item) => item.at <= start);
  const lastBefore = beforeStart[beforeStart.length - 1];
  if (lastBefore) {
    const value = known(lastBefore);
    if (!value) return unavailable;
    base = value;
  }
  if (history.executedAt.some((at) => Date.parse(at) > base.at && Date.parse(at) <= start)) return unavailable;

  const inside = snapshots.filter((item) => item.at > start);
  if (inside.length === 0) return unavailable;
  const close = known(inside[inside.length - 1]);
  if (!close) return unavailable;
  // A fill after the closing valuation means the close no longer shows the book's holdings or equity.
  if (history.executedAt.some((at) => Date.parse(at) > close.at && Date.parse(at) <= end)) return unavailable;

  const daily = new Map<string, Known>();
  for (const item of inside) {
    const value = known(item);
    if (value) daily.set(nyDate.format(new Date(item.at)), value);
  }
  const path = [base, ...[...daily.values()].sort((a, b) => a.at - b.at)];
  const equity = close.equity;
  return {
    participated: true,
    points: path.map((item) => ({ equity: item.equity })),
    holdings: equity > 0 ? close.holdings.map((holding) => ({ weight: Number(holding.value) / equity, sector: holding.sector ?? "Other" })) : [],
    cashWeight: equity > 0 ? close.cash / equity : 0,
  };
}
