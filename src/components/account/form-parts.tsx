"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { idleForm, type FormState } from "@/lib/account/types";

// Submitting through onSubmit skips React's automatic form reset, which would otherwise
// desynchronize controlled inputs from their state after a rejected submit.
export function useControlledFormAction(action: (previous: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, actionPending] = useActionState(action, idleForm);
  const [transitionPending, startTransition] = useTransition();
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  };
  return { state, onSubmit, pending: actionPending || transitionPending };
}

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-forest">{label}</label>
      <input id={id} name={id} className="v-field mt-1.5" aria-describedby={hintId} {...input} />
      {hint ? <p id={hintId} className="mt-1 text-[12px] leading-5 text-quiet">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel, className = "v-btn", pending: controlledPending }: { children: React.ReactNode; pendingLabel: string; className?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = controlledPending ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      data-state={state.status}
      className={error ? "rounded-xl border border-[#efd2cc] bg-loss-soft px-4 py-3 text-sm text-loss" : "rounded-xl border border-pale bg-mint px-4 py-3 text-sm text-forest"}
    >
      {state.message}
    </p>
  );
}
