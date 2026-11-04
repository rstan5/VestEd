import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { WatchlistState } from "./types";

export type WatchlistClient = SupabaseClient<Database>;

/** The caller's own watchlist, oldest first, read through Row Level Security. */
export async function loadWatchlist(client: WatchlistClient): Promise<WatchlistState> {
  const { data, error } = await client.from("watchlists").select("instrument_id, added_at").order("added_at").order("instrument_id");
  if (error) return { status: "error", message: "Your watchlist could not be loaded." };
  return { status: "ready", tickers: (data ?? []).map((row) => row.instrument_id) };
}
