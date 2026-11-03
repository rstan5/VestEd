"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/account/routes";
import type { FormState } from "@/lib/account/types";
import { firstIssue, readForm, signInSchema, signUpSchema } from "@/lib/account/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UNCONFIGURED: FormState = {
  status: "error",
  message: "Accounts are unavailable. Local Supabase is not configured for this app.",
};

export async function signUp(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["displayName", "email", "password"]);
  const values = { displayName: String(raw.displayName ?? ""), email: String(raw.email ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...UNCONFIGURED, values };

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });
  if (error) {
    const message =
      error.code === "user_already_exists" || error.code === "email_exists"
        ? "An account with this email already exists. Sign in instead."
        : error.code === "weak_password"
          ? "Choose a stronger password."
          : "Registration did not go through. Try again in a moment.";
    return { status: "error", message, values };
  }
  if (!data.session) {
    return { status: "success", message: "Check your email to confirm the account, then sign in.", values };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signIn(_previous: FormState, form: FormData): Promise<FormState> {
  const raw = readForm(form, ["email", "password"]);
  const values = { email: String(raw.email ?? "") };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...UNCONFIGURED, values };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "invalid_credentials" || error.status === 400
        ? "Email or password is incorrect."
        : "Sign-in is unavailable right now. Try again in a moment.";
    return { status: "error", message, values };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?signedOut=1");
}
