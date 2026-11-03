import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/account/onboarding-flow";
import { requireAccount } from "@/lib/account/session";

export const metadata: Metadata = { title: "Set up your account · VestEd" };

export default async function OnboardingPage() {
  const account = await requireAccount("/onboarding");
  if (account.onboarded) redirect("/");
  return (
    <div className="mx-auto max-w-[640px]">
      <p className="text-sm text-quiet">Account created</p>
      <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest">Set up your account</h1>
      <p className="mt-3 text-sm leading-6 text-quiet">Three short steps. Everything except your display name is optional, and you can change it later.</p>
      <OnboardingFlow account={account} />
    </div>
  );
}
