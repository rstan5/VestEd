"use client";

import { createContext, useContext } from "react";
import type { AccountState } from "./types";

const AccountContext = createContext<AccountState>({ status: "signed-out" });

export function AccountProvider({ value, children }: { value: AccountState; children: React.ReactNode }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccountState(): AccountState {
  return useContext(AccountContext);
}
