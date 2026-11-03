import type { Metadata } from "next";
import Link from "next/link";
import { StatusNote, Tag } from "@/components/ui";
import { requireAccount } from "@/lib/account/session";

export const metadata: Metadata = { title: "University verification · VestEd" };

export default async function VerificationPage() {
  await requireAccount("/account/verification");
  return (
    <section aria-labelledby="verification-heading" className="max-w-[640px]">
      <h1 id="verification-heading" className="serif text-[34px] leading-tight text-forest">University verification</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-forest">
        Your status: <Tag kind="unavailable">Not verified</Tag>
      </p>
      <p className="mt-3 text-sm leading-6 text-quiet">
        You have no university affiliation on file. You compete as an individual on the individual board. University and club boards count you only after a verification is approved.
      </p>
      <div className="mt-6">
        <StatusNote
          kind="unavailable"
          title="University email submission is not open yet"
          body="When it opens, a university email starts a pending review. A matching email domain alone never marks you verified."
          action={<Link href="/" className="v-btn quiet small">Continue as an individual</Link>}
        />
      </div>
    </section>
  );
}
