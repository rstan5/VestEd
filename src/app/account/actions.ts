"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/account/types";
import { firstIssue, onboardingSchema, passwordSchema, privacySchema, profileSchema, readForm } from "@/lib/account/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SIGNED_OUT: FormState = { status: "error", message: "Your session ended. Sign in again to save changes." };

// The user id always comes from the verified session, never from the submitted form.
async function sessionClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

function profileValues(raw: Record<string, FormDataEntryValue | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === "string" ? value : ""]));
}

export async function updateProfile(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["displayName", "classYear", "concentration"]);
  const values = profileValues(raw);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const session = await sessionClient();
  if (!session) return { ...SIGNED_OUT, values };

  const { data, error } = await session.supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      class_year: parsed.data.classYear,
      concentration: parsed.data.concentration,
    })
    .eq("id", session.userId)
    .select("display_name")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "Your profile was not saved. Try again.", values };

  revalidatePath("/", "layout");
  return { status: "success", message: `Saved. Your display name is now ${data.display_name}.`, values: { ...values, displayName: data.display_name } };
}

export async function updatePrivacy(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["holdings", "consent"]);
  const parsed = privacySchema.safeParse(raw);
  const values = { holdings: typeof raw.holdings === "string" ? raw.holdings : "private" };
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const session = await sessionClient();
  if (!session) return { ...SIGNED_OUT, values };

  const holdingsPublic = parsed.data.holdings === "public";
  const { data, error } = await session.supabase
    .from("profiles")
    .update({ holdings_public: holdingsPublic })
    .eq("id", session.userId)
    .select("holdings_public")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "Your privacy choice was not saved. Try again.", values };

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: data.holdings_public
      ? "Saved. Other students can now see your published tickers and weights."
      : "Saved. Your holdings are private again.",
    values: { holdings: data.holdings_public ? "public" : "private" },
  };
}

export async function finishOnboarding(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["displayName", "classYear", "concentration", "next"]);
  const values = profileValues(raw);
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const session = await sessionClient();
  if (!session) return { ...SIGNED_OUT, values };

  const { data, error } = await session.supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      class_year: parsed.data.classYear,
      concentration: parsed.data.concentration,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", session.userId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: "Setup was not saved. Try again.", values };

  revalidatePath("/", "layout");
  redirect(parsed.data.next === "verify" ? "/account/verification" : "/");
}

export async function changePassword(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(readForm(form, ["password", "confirm"]));
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  const session = await sessionClient();
  if (!session) return SIGNED_OUT;

  const { error } = await session.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const message = error.code === "same_password" ? "Choose a password you have not used for this account." : "Your password was not changed. Try again.";
    return { status: "error", message };
  }
  return { status: "success", message: "Password changed." };
}
