"use client";

import { useActionState } from "react";
import { submitUniversityEmail } from "@/app/campus/actions";
import { Field, FormMessage, SubmitButton } from "@/components/account/form-parts";
import { idleForm } from "@/lib/account/types";

export function AffiliationForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action] = useActionState(submitUniversityEmail, idleForm);
  const email = state.values?.email ?? defaultEmail;
  return (
    <form action={action} className="space-y-4" noValidate key={email}>
      <Field
        id="email"
        type="email"
        label="University email address"
        autoComplete="email"
        maxLength={254}
        placeholder="you@umich.edu"
        defaultValue={email}
        hint="Use the address your university issued. A matching domain starts a review. It does not verify you by itself."
      />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Submitting…">Submit for verification</SubmitButton>
    </form>
  );
}
