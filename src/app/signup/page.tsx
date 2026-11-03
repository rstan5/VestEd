import type { Metadata } from "next";
import { AccountsUnavailable, AuthFrame } from "@/components/account/auth-frame";
import { SignUpForm } from "@/components/account/auth-forms";
import { supabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create account · VestEd" };

export default function SignUpPage() {
  return (
    <AuthFrame
      eyebrow="Student account"
      title="Create your account"
      intro="You compete as an individual from day one. A club and university verification are optional and come later."
    >
      {supabaseEnv() ? <SignUpForm /> : <AccountsUnavailable />}
    </AuthFrame>
  );
}
