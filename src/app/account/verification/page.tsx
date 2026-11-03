import type { Metadata } from "next";
import Link from "next/link";
import { AffiliationForm } from "@/components/campus/affiliation-form";
import { AffiliationTag } from "@/components/campus/campus-tags";
import { StatusNote } from "@/components/ui";
import { requireAccount } from "@/lib/account/session";
import type { Affiliation } from "@/lib/campus/types";
import { shortDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "University verification · VestEd" };

export default async function VerificationPage() {
  const account = await requireAccount("/account/verification");
  const { affiliation, loadError } = account.campus;
  const supabase = await createSupabaseServerClient();
  const [domains, universities] = supabase
    ? await Promise.all([
        supabase.from("university_domains").select("domain, university_id").order("domain"),
        supabase.from("universities").select("id, name, short_name").order("name"),
      ])
    : [null, null];
  const names = new Map((universities?.data ?? []).map((row) => [row.id, row.name]));

  return (
    <section aria-labelledby="verification-heading" className="max-w-[640px]">
      <h1 id="verification-heading" className="serif text-[34px] leading-tight text-forest">University verification</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-forest">
        Your status: <AffiliationTag affiliation={affiliation} />
      </p>
      <p className="mt-3 text-sm leading-6 text-quiet" data-testid="affiliation-explainer">{explain(affiliation)}</p>

      {loadError ? (
        <div className="mt-6">
          <StatusNote kind="error" compact title="Your verification status could not be loaded" body="Reload the page to try again." />
        </div>
      ) : null}

      {affiliation?.status === "verified" ? null : (
        <div className="mt-6 rounded-3xl border border-rule bg-paper p-6">
          <AffiliationForm defaultEmail={affiliation?.status === "pending" ? affiliation.email : ""} />
        </div>
      )}

      <h2 className="mt-10 text-sm text-quiet">How verification works</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-forest">
        <li>Submit your university email. A recognized domain links you to that university as <strong className="font-medium">pending</strong>.</li>
        <li>A VestEd reviewer confirms enrollment. Only that decision marks you <strong className="font-medium">verified</strong>.</li>
        <li>Until then you trade and rank on the individual board. University and club boards count verified students only.</li>
      </ol>

      <h2 className="mt-10 text-sm text-quiet">Recognized university domains</h2>
      {domains && !domains.error && domains.data.length > 0 ? (
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          {domains.data.map((row) => (
            <li key={row.domain} className="flex justify-between gap-4 py-2.5">
              <span className="mono text-forest">@{row.domain}</span>
              <span className="text-right text-quiet">{names.get(row.university_id) ?? row.university_id}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <StatusNote kind="unavailable" compact title="The domain list could not be loaded" body="You can still submit your address. Reload to see the list." />
        </div>
      )}
      <p className="mt-2 text-[12px] text-quiet">Subdomains count too, for example @med.umich.edu.</p>

      <p className="mt-8 text-sm">
        <Link href="/" className="text-primary underline-offset-4 hover:underline">Continue as an individual →</Link>
      </p>
    </section>
  );
}

function explain(affiliation: Affiliation | null): string {
  if (!affiliation) {
    return "You have no university affiliation on file. You compete as an individual on the individual board. University and club boards count you only after a verification is approved.";
  }
  if (affiliation.status === "pending") {
    return `You submitted ${affiliation.email} for ${affiliation.universityName} on ${shortDate(affiliation.submittedAt)}. A reviewer has not decided yet, so you are not verified. Other students see you as not verified until then.`;
  }
  if (affiliation.status === "verified") {
    return `Verified with ${affiliation.universityName}${affiliation.decidedAt ? ` on ${shortDate(affiliation.decidedAt)}` : ""}. Your results can count toward university standings.`;
  }
  return `The verification for ${affiliation.email} was declined. You still compete as an individual. You can submit a different university address.`;
}
