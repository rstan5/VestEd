"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/account/actions";
import { idleForm, type Account } from "@/lib/account/types";
import { Field, FormMessage, SubmitButton } from "./form-parts";

export function ProfileForm({ account }: { account: Account }) {
  const [state, action] = useActionState(updateProfile, idleForm);
  const values = state.values ?? {
    displayName: account.displayName,
    classYear: account.classYear ? String(account.classYear) : "",
    concentration: account.concentration ?? "",
  };
  const version = JSON.stringify(values);

  return (
    <form action={action} className="space-y-5" noValidate key={version}>
      <Field id="displayName" label="Display name" required maxLength={60} autoComplete="name" defaultValue={values.displayName} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="classYear" label="Class year (optional)" inputMode="numeric" maxLength={4} placeholder="2028" defaultValue={values.classYear} />
        <Field id="concentration" label="Concentration (optional)" maxLength={80} placeholder="Economics" defaultValue={values.concentration} />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
