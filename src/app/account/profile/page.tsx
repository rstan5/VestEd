import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/account/profile-form";
import { AffiliationTag, ClubStatusTag } from "@/components/campus/campus-tags";
import { roleLabel } from "@/lib/campus/types";
import { requireAccount } from "@/lib/account/session";

export const metadata: Metadata = { title: "Profile · VestEd" };

export default async function ProfilePage() {
  const account = await requireAccount("/account/profile");
  const { affiliation, club } = account.campus;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section aria-labelledby="profile-heading">
        <h1 id="profile-heading" className="serif text-[34px] leading-tight text-forest">Profile</h1>
        <p className="mt-2 text-sm leading-6 text-quiet">Your display name appears on standings and on your public profile.</p>
        <div className="mt-6 rounded-3xl border border-rule bg-paper p-6">
          <ProfileForm account={account} />
        </div>
      </section>
      <aside aria-labelledby="status-heading" className="lg:pt-14">
        <h2 id="status-heading" className="text-sm text-quiet">Account status</h2>
        <dl className="mt-3 divide-y divide-rule border-y border-rule text-sm">
          <Row label="Account">{club ? "Club member" : "Individual"}</Row>
          <Row label="University"><AffiliationTag affiliation={affiliation} /></Row>
          <Row label="Club">
            {club ? (
              <span className="flex flex-col items-end gap-1 text-right">
                <Link href={`/campus/clubs/${club.clubId}`} className="underline-offset-4 hover:underline">{club.clubName} · {roleLabel(club.role)}</Link>
                <ClubStatusTag club={club} />
              </span>
            ) : (
              "None"
            )}
          </Row>
          <Row label="Holdings">{account.holdingsPublic ? "Published" : "Private"}</Row>
        </dl>
        <div className="mt-5 space-y-2 text-sm">
          <Link href={`/students/${account.id}`} className="block text-primary underline-offset-4 hover:underline">See your public profile →</Link>
          <Link href="/account/verification" className="block text-primary underline-offset-4 hover:underline">University verification →</Link>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-quiet">{label}</dt>
      <dd className="text-forest">{children}</dd>
    </div>
  );
}
