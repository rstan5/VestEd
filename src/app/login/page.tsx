import type { Metadata } from "next";
import { AccountsUnavailable, AuthFrame } from "@/components/account/auth-frame";
import { SignInForm } from "@/components/account/auth-forms";
import { safeNext } from "@/lib/account/routes";
import { supabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in · VestEd" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  const signedOut = params.signedOut === "1";

  return (
    <AuthFrame eyebrow="Student account" title="Sign in" intro="Pick up your book, your rank, and your saved Professor conversations.">
      {signedOut ? (
        <p role="status" className="mb-5 rounded-xl border border-rule bg-wash px-4 py-3 text-sm text-forest">You are signed out.</p>
      ) : null}
      {supabaseEnv() ? <SignInForm next={next} /> : <AccountsUnavailable />}
    </AuthFrame>
  );
}
