import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database";
import type { Account, AccountState } from "./types";

export function toAccount(profile: ProfileRow, email: string): Account {
  return {
    id: profile.id,
    email,
    displayName: profile.display_name,
    classYear: profile.class_year,
    concentration: profile.concentration,
    holdingsPublic: profile.holdings_public,
    onboarded: profile.onboarded_at !== null,
    memberSince: profile.created_at,
  };
}

export const getAccountState = cache(async (): Promise<AccountState> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unconfigured" };
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { status: "signed-out" };
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) return { status: "error", message: "Your profile could not be loaded." };
    if (!profile) return { status: "error", message: "This sign-in has no student profile." };
    return { status: "signed-in", account: toAccount(profile, data.user.email ?? "") };
  } catch {
    return { status: "error", message: "The account service did not respond." };
  }
});

export async function requireAccount(next: string): Promise<Account> {
  const state = await getAccountState();
  if (state.status === "signed-in") return state.account;
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
