import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export type CurrentRound = {
  seasonName: string;
  roundName: string;
  startsAt: string;
  endsAt: string;
  status: "live" | "scheduled";
};

type SeasonRow = { id: string; name: string; starts_at: string; ends_at: string };
type RoundRow = { season_id: string; name: string; number: number; starts_at: string; ends_at: string };

/** The season the standings page shows: the open one, else the next, else the most recent. */
export function pickSeason<T extends SeasonRow>(seasons: T[], now: Date): T | null {
  const at = now.getTime();
  const sorted = [...seasons].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return (
    sorted.find((item) => Date.parse(item.starts_at) <= at && at < Date.parse(item.ends_at)) ??
    sorted.find((item) => Date.parse(item.starts_at) > at) ??
    sorted[sorted.length - 1] ??
    null
  );
}

/** The live round of the season, or the next one to open. Null once every round has ended. */
export function currentRoundOf(season: SeasonRow, rounds: RoundRow[], now: Date): CurrentRound | null {
  const at = now.getTime();
  const own = rounds.filter((round) => round.season_id === season.id).sort((a, b) => a.number - b.number);
  const live = own.find((round) => Date.parse(round.starts_at) <= at && at < Date.parse(round.ends_at));
  const next = own.find((round) => Date.parse(round.starts_at) > at);
  const round = live ?? next;
  if (!round) return null;
  return { seasonName: season.name, roundName: round.name, startsAt: round.starts_at, endsAt: round.ends_at, status: live ? "live" : "scheduled" };
}

/** Reads the round schedule through Row Level Security, so a signed-out request gets null. */
export async function loadCurrentRound(client: SupabaseClient<Database>, now = new Date()): Promise<CurrentRound | null> {
  const seasons = await client.from("seasons").select("id, name, starts_at, ends_at");
  if (seasons.error) return null;
  const season = pickSeason(seasons.data ?? [], now);
  if (!season) return null;
  const rounds = await client.from("rounds").select("season_id, name, number, starts_at, ends_at").eq("season_id", season.id);
  if (rounds.error) return null;
  return currentRoundOf(season, rounds.data ?? [], now);
}

/** Round boundaries are New York dates, so a midnight close reads as that New York day. */
export function roundDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(iso));
}

export function roundCloseLabel(round: CurrentRound): string {
  return round.status === "live" ? `closes ${roundDate(round.endsAt)}` : `opens ${roundDate(round.startsAt)}`;
}
