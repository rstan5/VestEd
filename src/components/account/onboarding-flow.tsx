"use client";

import { useEffect, useRef, useState } from "react";
import { finishOnboarding } from "@/app/account/actions";
import { Tag } from "@/components/ui";
import type { Account } from "@/lib/account/types";
import { Field, FormMessage, SubmitButton, useControlledFormAction } from "./form-parts";

const steps = ["Profile basics", "University", "Club", "Review"] as const;

export function OnboardingFlow({ account }: { account: Account }) {
  const { state, onSubmit, pending } = useControlledFormAction(finishOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.values?.displayName ?? account.displayName);
  const [classYear, setClassYear] = useState(state.values?.classYear ?? (account.classYear ? String(account.classYear) : ""));
  const [concentration, setConcentration] = useState(state.values?.concentration ?? account.concentration ?? "");
  const [next, setNext] = useState<"individual" | "verify">("individual");
  const [nameError, setNameError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const go = (target: number) => {
    if (target > 0 && name.trim() === "") {
      setNameError("Enter a display name to continue.");
      setStep(0);
      return;
    }
    setNameError(null);
    setStep(target);
  };

  return (
    <form onSubmit={onSubmit} className="mt-8" noValidate>
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Setup steps">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "font-medium text-deep" : index < step ? "text-forest" : "text-quiet"}>
            <span className="mono mr-1.5">{index + 1}</span>
            {label}
            {index < step ? <span className="sr-only"> (done)</span> : null}
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-3xl border border-rule bg-paper p-6 md:p-8">
        <p className="text-[12px] uppercase tracking-[0.08em] text-quiet">Step {step + 1} of {steps.length}</p>
        <h2 ref={heading} tabIndex={-1} className="serif mt-1 text-2xl text-forest">{stepTitle(step)}</h2>

        <section hidden={step !== 0} className="mt-5 space-y-5">
          <Field id="displayName" label="Display name" required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} hint="Other students see this name on standings and your public profile." aria-invalid={nameError ? true : undefined} />
          {nameError ? <p role="alert" className="text-sm text-loss">{nameError}</p> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="classYear" label="Class year (optional)" inputMode="numeric" maxLength={4} placeholder="2028" value={classYear} onChange={(event) => setClassYear(event.target.value)} />
            <Field id="concentration" label="Concentration (optional)" maxLength={80} placeholder="Economics" value={concentration} onChange={(event) => setConcentration(event.target.value)} />
          </div>
        </section>

        <section hidden={step !== 1} className="mt-5 space-y-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-forest">
            Your status: <Tag kind="unavailable">Not verified</Tag>
          </p>
          <p className="text-sm leading-6 text-quiet">
            VestEd does not know your university yet. A university email address starts a review, but it does not verify you by itself. Until a verification is approved, you appear only on the individual board.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-sm text-forest">How do you want to continue?</legend>
            <Choice name="next" value="individual" checked={next === "individual"} onChange={() => setNext("individual")} title="Continue as an individual for now" body="Trade and compete on the individual board. Verify a university any time from the account menu." />
            <Choice name="next" value="verify" checked={next === "verify"} onChange={() => setNext("verify")} title="Open university verification after setup" body="You will land on the verification page. You stay unverified until it is approved." />
          </fieldset>
        </section>

        <section hidden={step !== 2} className="mt-5 space-y-3">
          <p className="text-sm leading-6 text-quiet">
            Clubs are optional. You do not need one to trade, to appear on the individual board, or to keep your book. You can apply to a club later from Campus.
          </p>
          <p className="rounded-xl bg-wash px-4 py-3 text-sm text-forest">You are not joining a club now.</p>
        </section>

        <section hidden={step !== 3} className="mt-5">
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <Summary label="Display name" value={name.trim() || "Missing"} />
            <Summary label="Class year" value={classYear.trim() || "Not given"} />
            <Summary label="Concentration" value={concentration.trim() || "Not given"} />
            <Summary label="Account" value="Individual" />
            <Summary label="University" value="Not verified" />
            <Summary label="Club" value="None" />
            <Summary label="Holdings" value="Private (default)" />
            <Summary label="After setup" value={next === "verify" ? "University verification page" : "Home, as an individual"} />
          </dl>
          <div className="mt-5"><FormMessage state={state} /></div>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" className="v-btn quiet" onClick={() => go(step - 1)}>Back</button>
          ) : <span />}
          {step < 3 ? (
            <button type="button" className="v-btn" onClick={() => go(step + 1)}>
              {step === 2 ? "Skip clubs for now" : "Continue"}
            </button>
          ) : (
            <SubmitButton pendingLabel="Finishing…" pending={pending}>Finish setup</SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}

function stepTitle(step: number): string {
  if (step === 0) return "Tell other students who you are";
  if (step === 1) return "University verification";
  if (step === 2) return "Join a club, or not";
  return "Review and finish";
}

function Choice({ name, value, checked, onChange, title, body }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; body: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-rule p-4 has-[:checked]:border-sage has-[:checked]:bg-wash">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 accent-[#174f36]" />
      <span>
        <span className="block text-sm font-medium text-forest">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-quiet">{body}</span>
      </span>
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-quiet">{label}</dt>
      <dd className="text-right text-forest">{value}</dd>
    </div>
  );
}
