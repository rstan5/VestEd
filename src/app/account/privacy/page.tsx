import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyForm } from "@/components/account/privacy-form";
import { requireAccount } from "@/lib/account/session";

export const metadata: Metadata = { title: "Privacy · VestEd" };

export default async function PrivacyPage() {
  const account = await requireAccount("/account/privacy");
  return (
    <section aria-labelledby="privacy-heading" className="max-w-[640px]">
      <h1 id="privacy-heading" className="serif text-[34px] leading-tight text-forest">Privacy</h1>
      <p className="mt-2 text-sm leading-6 text-quiet">
        Your book is private by default. Publishing is your choice, and you can undo it at any time.
      </p>
      <div className="mt-6 rounded-3xl border border-rule bg-paper p-6">
        <PrivacyForm holdingsPublic={account.holdingsPublic} />
      </div>
      <h2 className="mt-10 text-sm text-quiet">What other students can see</h2>
      <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
        <Visibility item="Display name, class year, concentration, member since" when="Always" />
        <Visibility item="Tickers and portfolio weights" when="Only while published" />
        <Visibility item="Cash, share quantities, cost basis" when="Never" />
        <Visibility item="Orders and activity" when="Never" />
      </ul>
      <p className="mt-4 text-sm">
        <Link href={`/students/${account.id}`} className="text-primary underline-offset-4 hover:underline">See your public profile →</Link>
      </p>
    </section>
  );
}

function Visibility({ item, when }: { item: string; when: string }) {
  return (
    <li className="flex justify-between gap-4 py-2.5">
      <span className="text-forest">{item}</span>
      <span className="shrink-0 text-quiet">{when}</span>
    </li>
  );
}
