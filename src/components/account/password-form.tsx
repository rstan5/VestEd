"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/account/actions";
import { idleForm } from "@/lib/account/types";
import { Field, FormMessage, SubmitButton } from "./form-parts";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, idleForm);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="password" label="New password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
      <Field id="confirm" label="Repeat new password" type="password" autoComplete="new-password" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
    </form>
  );
}
