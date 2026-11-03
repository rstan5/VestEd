"use client";

import { useActionState } from "react";
import { fileDispute } from "@/app/campus/actions";
import { FormMessage, SubmitButton } from "@/components/account/form-parts";
import { idleForm } from "@/lib/account/types";

export function DisputeForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(fileDispute, idleForm);
  const reason = state.status === "error" ? (state.values?.reason ?? "") : "";
  return (
    <form action={action} className="space-y-4" noValidate key={`${state.status}:${reason}`}>
      <input type="hidden" name="clubId" value={clubId} />
      <div>
        <label htmlFor="reason" className="block text-sm text-forest">What is disputed?</label>
        <textarea id="reason" name="reason" rows={3} minLength={10} maxLength={1000} className="v-field mt-1.5" defaultValue={reason} aria-describedby="reason-hint" />
        <p id="reason-hint" className="mt-1 text-[12px] leading-5 text-quiet">For example, the club uses another organization&apos;s name, or its leadership is contested. An admin reviewer decides.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Filing…" className="v-btn quiet">File a dispute</SubmitButton>
    </form>
  );
}
