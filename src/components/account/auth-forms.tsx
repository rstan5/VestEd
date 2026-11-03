"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp } from "@/app/auth/actions";
import { idleForm } from "@/lib/account/types";
import { Field, FormMessage, SubmitButton } from "./form-parts";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, idleForm);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? ""} key={`email-${state.values?.email ?? ""}`} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Signing in…" className="v-btn w-full">Sign in</SubmitButton>
      <p className="text-center text-sm text-quiet">
        New to VestEd? <Link href="/signup" className="text-primary underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, idleForm);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="displayName" label="Display name" autoComplete="name" required maxLength={60} defaultValue={state.values?.displayName ?? ""} key={`name-${state.values?.displayName ?? ""}`} hint="Shown to other students on standings and your public profile." />
      <Field id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? ""} key={`email-${state.values?.email ?? ""}`} hint="Any email works. A university address does not verify you by itself." />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creating account…" className="v-btn w-full">Create account</SubmitButton>
      <p className="text-center text-sm text-quiet">
        Already registered? <Link href="/login" className="text-primary underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
