import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCurrentRound, type CurrentRound } from "./current-round";

export const getCurrentRound = cache(async (): Promise<CurrentRound | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  try {
    return await loadCurrentRound(supabase);
  } catch {
    return null;
  }
});
