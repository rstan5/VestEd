"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/account/form-parts";
import { idleForm, type FormState } from "@/lib/account/types";

type Props = {
  action: (previous: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  className?: string;
  testId?: string;
};

export function ActionButton({ action, fields, label, pendingLabel, className = "v-btn small", testId }: Props) {
  const [state, dispatch] = useActionState(action, idleForm);
  return (
    <form action={dispatch} className="inline-flex flex-col items-start gap-2" data-testid={testId}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton pendingLabel={pendingLabel} className={className}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
