import { DEMO_INVESTOR_ID, type Ledger } from "./domain";
import { canonicalLedger } from "./sample-data";

export const LEDGER_KEY = "vested.demo.ledger.v1";
export const WATCHLIST_KEY = "vested.demo.watchlist.v1";

export function loadLedger(): Ledger {
  if (typeof window === "undefined") return clone(canonicalLedger);
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) return clone(canonicalLedger);
    const parsed = JSON.parse(raw) as Ledger;
    if (!Array.isArray(parsed.positions) || !Array.isArray(parsed.orders) || typeof parsed.cash !== "number") {
      return clone(canonicalLedger);
    }
    return parsed;
  } catch {
    return clone(canonicalLedger);
  }
}

export function saveLedger(ledger: Ledger): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

export function resetDemo(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEDGER_KEY);
  window.localStorage.removeItem(WATCHLIST_KEY);
}

export function loadWatchlist(fallback: string[]): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveWatchlist(tickers: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(tickers));
}

export function demoSessionLabel(): string {
  return `${DEMO_INVESTOR_ID} · sample session`;
}

function clone(ledger: Ledger): Ledger {
  return structuredClone(ledger);
}
