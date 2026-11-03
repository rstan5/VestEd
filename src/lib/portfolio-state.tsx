"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Ledger } from "./domain";
import { placeOrder, type OrderResult } from "./portfolio";
import { canonicalLedger, securities, watchlist as defaultWatchlist } from "./sample-data";
import { loadLedger, loadWatchlist, resetDemo, saveLedger, saveWatchlist } from "./storage";
import { mayaView, rankedStandings } from "./view";

type Store = {
  ready: boolean;
  ledger: Ledger;
  watchlist: string[];
  book: ReturnType<typeof mayaView>["book"];
  standing: ReturnType<typeof mayaView>["standing"];
  seasonReturn: number;
  standings: ReturnType<typeof rankedStandings>;
  submitOrder: (ticker: string, side: "buy" | "sell", quantity: number) => OrderResult;
  toggleWatch: (ticker: string) => void;
  reset: () => void;
};

const PortfolioContext = createContext<Store | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [ledger, setLedger] = useState<Ledger>(canonicalLedger);
  const [watchlist, setWatchlist] = useState<string[]>(defaultWatchlist);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLedger(loadLedger());
    setWatchlist(loadWatchlist(defaultWatchlist));
    setReady(true);
  }, []);

  const view = useMemo(() => mayaView(ledger), [ledger]);
  const standings = useMemo(() => rankedStandings(view.standing), [view.standing]);

  const store: Store = {
    ready,
    ledger,
    watchlist,
    book: view.book,
    standing: view.standing,
    seasonReturn: view.seasonReturn,
    standings,
    submitOrder: (ticker, side, quantity) => {
      const result = placeOrder(ledger, securities, {
        ticker,
        side,
        quantity,
        clientOrderId: `ord-${Date.now()}`,
      });
      setLedger(result.ledger);
      saveLedger(result.ledger);
      return result;
    },
    toggleWatch: (ticker) => {
      const next = watchlist.includes(ticker)
        ? watchlist.filter((item) => item !== ticker)
        : [...watchlist, ticker];
      setWatchlist(next);
      saveWatchlist(next);
    },
    reset: () => {
      resetDemo();
      setLedger(structuredClone(canonicalLedger));
      setWatchlist(defaultWatchlist);
    },
  };

  return <PortfolioContext.Provider value={store}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): Store {
  const store = useContext(PortfolioContext);
  if (!store) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return store;
}
