import { cache } from "react";
import { getAccountState } from "@/lib/account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLedgerBook } from "./load";
import type { LedgerState } from "./types";

export const getLedgerState = cache(async (): Promise<LedgerState> => {
  const account = await getAccountState();
  if (account.status !== "signed-in") return { status: "signed-out" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unavailable", message: "The ledger is not configured." };
  try {
    return await loadLedgerBook(supabase);
  } catch {
    return { status: "unavailable", message: "The ledger did not respond." };
  }
});
