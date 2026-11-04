"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccountState } from "./account/context";
import type { Ledger } from "./domain";
import {
  cancelServerOrder,
  fetchStudentLedger,
  submitServerOrder,
  type ServerOrderResult,
  type StudentLedgerState,
} from "./ledger/client";
import { createStudentLedgerLoader, initialStudentLedger, studentLedgerFor, type KeyedStudentLedger } from "./ledger/student-loader";
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
  /** The signed-in student's own server ledger, keyed to their profile id. Never the sample book. */
  student: StudentLedgerState;
  refreshStudent: () => Promise<void>;
  placeServerOrder: (input: { instrument: string; side: "buy" | "sell"; quantity: number; idempotencyKey: string }) => Promise<ServerOrderResult>;
  cancelOrder: (orderId: string) => Promise<ServerOrderResult>;
  submitOrder: (ticker: string, side: "buy" | "sell", quantity: number) => OrderResult;
  toggleWatch: (ticker: string) => void;
  reset: () => void;
};

const PortfolioContext = createContext<Store | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [ledger, setLedger] = useState<Ledger>(canonicalLedger);
  const [watchlist, setWatchlist] = useState<string[]>(defaultWatchlist);
  const [ready, setReady] = useState(false);
  const accountState = useAccountState();
  const profileId = accountState.status === "signed-in" ? accountState.account.id : null;
  const [keyedStudent, setKeyedStudent] = useState<KeyedStudentLedger>(() => initialStudentLedger(profileId));
  const [loader] = useState(() => createStudentLedgerLoader(fetchStudentLedger, setKeyedStudent));
  const student = studentLedgerFor(keyedStudent, profileId);

  useEffect(() => {
    setLedger(loadLedger());
    setWatchlist(loadWatchlist(defaultWatchlist));
    setReady(true);
  }, []);

  const refreshStudent = useCallback(() => loader.refresh(), [loader]);

  useEffect(() => {
    void loader.select(profileId);
    return () => loader.cancel();
  }, [loader, profileId]);

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
    student,
    refreshStudent,
    placeServerOrder: async (input) => {
      const result = await submitServerOrder(input);
      if (result.ok) await refreshStudent();
      return result;
    },
    cancelOrder: async (orderId) => {
      const result = await cancelServerOrder(orderId);
      if (result.ok) await refreshStudent();
      return result;
    },
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
