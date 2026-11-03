import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusNote, Tag } from "@/components/ui";
import { plainPercent } from "@/lib/format";
import { requireAccount } from "@/lib/account/session";
import { memberSinceLabel } from "@/lib/account/types";
import { roleLabel, toClubRole } from "@/lib/campus/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student profile · VestEd" };

const studentId = z.uuid();

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireAccount(`/students/${id}`);
  if (!studentId.safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  // Only the safe projection functions are read here. The private book is never queried.
  const [profileResult, holdingsResult, campusResult] = await Promise.all([
    supabase.rpc("public_profile", { target: id }).maybeSingle(),
    supabase.rpc("public_holdings", { target: id }),
    supabase.rpc("public_campus", { target: id }).maybeSingle(),
  ]);
  if (profileResult.error) {
    return <StatusNote kind="error" title="This profile could not be loaded" body="The account service did not respond. Reload the page to try again." />;
  }
  const profile = profileResult.data;
  if (!profile) notFound();

  const holdings = holdingsResult.data ?? [];
  const campus = campusResult.data;
  const isSelf = viewer.id === profile.id;
  const details = [profile.class_year ? `Class of ${profile.class_year}` : null, profile.concentration].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[880px]">
      {isSelf ? (
        <p role="status" className="mb-8 rounded-2xl border border-rule bg-wash px-5 py-3 text-sm text-forest">
          This is your public profile. Other signed-in students see exactly this page.{" "}
          <Link href="/account/privacy" className="text-primary underline-offset-4 hover:underline">Change privacy</Link>
        </p>
      ) : null}

      <header>
        <p className="text-sm text-quiet">Student profile</p>
        <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest" data-testid="public-name">{profile.display_name}</h1>
        {details ? <p className="mt-2 text-sm text-quiet">{details}</p> : null}
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Status">
          {campusResult.error ? (
            <li><Tag kind="unavailable">Campus status unavailable</Tag></li>
          ) : (
            <>
              <li>
                {campus?.verified_university ? <Tag>Verified · {campus.verified_university}</Tag> : <Tag kind="unavailable">University not verified</Tag>}
              </li>
              <li>
                {campus?.club_id && campus.club_name ? (
                  <Link href={`/campus/clubs/${campus.club_id}`} className="v-tag hover:border-sage">
                    {roleLabel(toClubRole(campus.club_role ?? "member"))} · {campus.club_name}{campus.club_official ? "" : " (not official)"}
                  </Link>
                ) : (
                  <Tag>Individual · No club</Tag>
                )}
              </li>
            </>
          )}
          <li><Tag>Member since {memberSinceLabel(profile.member_since)}</Tag></li>
        </ul>
      </header>

      <section aria-labelledby="holdings-heading" className="mt-12" data-testid="public-holdings" data-visibility={profile.holdings_public ? "published" : "private"}>
        <div className="flex items-center gap-2">
          <h2 id="holdings-heading" className="text-sm text-quiet">Holdings</h2>
          {profile.holdings_public ? <Tag kind="provisional">Published by the student</Tag> : <Tag>Private</Tag>}
        </div>
        {!profile.holdings_public ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-quiet">
            {isSelf ? "Your holdings are private." : `${profile.display_name} keeps their holdings private.`} Other students cannot see positions, quantities, cost, cash, orders, or activity.
          </p>
        ) : holdingsResult.error ? (
          <div className="mt-3"><StatusNote kind="error" compact title="Published holdings could not be loaded" body="Reload the page to try again." /></div>
        ) : holdings.length === 0 ? (
          <div className="mt-3"><StatusNote kind="empty" compact title="No positions to show" body="Holdings are published, but this book has no positions recorded on the server yet." /></div>
        ) : (
          <table className="v-table mt-3 max-w-xl">
            <thead>
              <tr><th className="text-left">Ticker</th><th className="text-right">Weight</th></tr>
            </thead>
            <tbody>
              {holdings.map((row) => (
                <tr key={row.ticker}>
                  <td className="mono">{row.ticker}</td>
                  <td className="mono text-right">{plainPercent(Number(row.weight), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {profile.holdings_public ? <p className="mt-3 text-[12px] text-quiet">Weights only. Cash, share quantities, cost, orders, and activity are never published.</p> : null}
      </section>
    </div>
  );
}
