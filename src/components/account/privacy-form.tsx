"use client";

import { useState } from "react";
import { updatePrivacy } from "@/app/account/actions";
import { Tag } from "@/components/ui";
import { FormMessage, SubmitButton, useControlledFormAction } from "./form-parts";

export function PrivacyForm({ holdingsPublic }: { holdingsPublic: boolean }) {
  const { state, onSubmit, pending } = useControlledFormAction(updatePrivacy);
  const saved = state.status === "success" ? state.values?.holdings === "public" : holdingsPublic;
  const [choice, setChoice] = useState<"private" | "public">(saved ? "public" : "private");
  const publishing = choice === "public" && !saved;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="flex flex-wrap items-center gap-2 text-sm text-forest" data-testid="holdings-status">
        Current setting:
        {saved ? <Tag kind="provisional">Holdings published</Tag> : <Tag>Holdings private</Tag>}
        {!saved && !holdingsPublic && state.status === "idle" ? <span className="text-[12px] text-quiet">Default for every new account</span> : null}
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm text-forest">Holdings visibility</legend>
        <Option value="private" checked={choice === "private"} onChange={() => setChoice("private")} title="Private" body="Only you can see your positions. Other students see your public profile without holdings." />
        <Option value="public" checked={choice === "public"} onChange={() => setChoice("public")} title="Published" body="Other signed-in students see your tickers and portfolio weights. Never cash, quantities, cost, orders, or activity." />
      </fieldset>
      {publishing ? (
        <label className="flex gap-3 rounded-xl bg-wash px-4 py-3 text-sm text-forest">
          <input type="checkbox" name="consent" value="yes" className="mt-0.5 accent-[#174f36]" />
          <span>I understand other students will see my tickers and weights until I switch back to private.</span>
        </label>
      ) : choice === "public" ? (
        <input type="hidden" name="consent" value="yes" />
      ) : null}
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…" pending={pending}>Save privacy choice</SubmitButton>
    </form>
  );
}

function Option({ value, checked, onChange, title, body }: { value: string; checked: boolean; onChange: () => void; title: string; body: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-rule p-4 has-[:checked]:border-sage has-[:checked]:bg-wash">
      <input type="radio" name="holdings" value={value} checked={checked} onChange={onChange} className="mt-1 accent-[#174f36]" />
      <span>
        <span className="block text-sm font-medium text-forest">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-quiet">{body}</span>
      </span>
    </label>
  );
}
