"use client";

import { createContext, useContext } from "react";
import type { CurrentRound } from "./current-round";

const RoundContext = createContext<CurrentRound | null>(null);

export function RoundProvider({ value, children }: { value: CurrentRound | null; children: React.ReactNode }) {
  return <RoundContext.Provider value={value}>{children}</RoundContext.Provider>;
}

/** The server's current round for the signed-in student, or null when the schedule cannot be read. */
export function useCurrentRound(): CurrentRound | null {
  return useContext(RoundContext);
}
