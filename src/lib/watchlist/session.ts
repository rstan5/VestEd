import { cache } from "react";
import { getAccountState } from "@/lib/account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWatchlist } from "./load";
import type { WatchlistState } from "./types";

export const getWatchlistState = cache(async (): Promise<WatchlistState> => {
  const account = await getAccountState();
  if (account.status !== "signed-in") return { status: "signed-out" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "The watchlist is not configured." };
  try {
    return await loadWatchlist(supabase);
  } catch {
    return { status: "error", message: "The watchlist did not respond." };
  }
});
