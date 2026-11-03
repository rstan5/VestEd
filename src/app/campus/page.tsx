import type { Metadata } from "next";
import Link from "next/link";
import { AffiliationTag, ClubStatusTag, MembershipTag } from "@/components/campus/campus-tags";
import { CreateClubForm } from "@/components/campus/create-club-form";
import { StatusNote, Tag } from "@/components/ui";
import { requireAccount } from "@/lib/account/session";
import { toClubListing } from "@/lib/campus/load";
import { shortDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Campus · VestEd" };

export default async function CampusPage() {
  const account = await requireAccount("/campus");
  const { affiliation, club, history, loadError } = account.campus;
  const supabase = await createSupabaseServerClient();
  const [directory, universities] = supabase
    ? await Promise.all([
        supabase.rpc("club_directory", {}),
        supabase.from("universities").select("id, name, short_name").order("name"),
      ])
    : [null, null];
  const clubs = directory && !directory.error ? (directory.data ?? []).map(toClubListing) : null;
  const pending = history.filter((item) => item.status === "pending" || item.status === "rejected");

  return (
    <div className="mx-auto max-w-[980px]">
      <header>
        <p className="text-sm text-quiet">Campus</p>
        <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest">Clubs and university</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-quiet">
          Both are optional. You trade and rank as an individual either way. A club or university board counts you only after the membership is approved and the university is verified.
        </p>
      </header>

      {loadError ? (
        <div className="mt-6"><StatusNote kind="error" compact title="Your campus status could not be loaded" body="Reload the page to try again." /></div>
      ) : null}

      <section aria-labelledby="standing-heading" className="mt-10 rounded-2xl border border-rule bg-paper">
        <h2 id="standing-heading" className="sr-only">Your campus standing</h2>
        <dl className="grid divide-y divide-rule md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="flex flex-col gap-2 px-5 py-4">
            <dt className="text-[12px] text-quiet">University</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              <AffiliationTag affiliation={affiliation} />
              <Link href="/account/verification" className="text-primary underline-offset-4 hover:underline">
                {affiliation?.status === "verified" ? "Details" : affiliation?.status === "pending" ? "View request" : "Verify a university"}
              </Link>
            </dd>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4" data-testid="my-club">
            <dt className="text-[12px] text-quiet">Club</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              {club ? (
                <>
                  <Link href={`/campus/clubs/${club.clubId}`} className="font-medium text-forest underline-offset-4 hover:underline">{club.clubName}</Link>
                  <MembershipTag membership={club} />
                  <ClubStatusTag club={club} />
                </>
              ) : (
                <span className="text-quiet">Not in a club · competing as an individual</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {pending.length > 0 ? (
        <section aria-labelledby="applications-heading" className="mt-10">
          <h2 id="applications-heading" className="text-sm text-quiet">Your applications</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {pending.map((item) => (
              <li key={item.clubId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <Link href={`/campus/clubs/${item.clubId}`} className="text-forest underline-offset-4 hover:underline">{item.clubName}</Link>
                <span className="flex items-center gap-3">
                  <span className="text-[12px] text-quiet">{item.decidedAt ? `Decided ${shortDate(item.decidedAt)}` : `Applied ${shortDate(item.appliedAt)}`}</span>
                  <MembershipTag membership={item} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="clubs-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="clubs-heading" className="serif text-2xl text-forest">Student clubs</h2>
          <span className="text-[12px] text-quiet">Official only after admin review</span>
        </div>
        {clubs === null ? (
          <div className="mt-4"><StatusNote kind="error" compact title="The club directory could not be loaded" body="Reload the page to try again." /></div>
        ) : clubs.length === 0 ? (
          <div className="mt-4"><StatusNote kind="empty" compact title="No student clubs yet" body="Start the first one below. It stays unofficial until a reviewer approves it." /></div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="v-table" data-testid="club-directory">
              <thead>
                <tr>
                  <th className="text-left">Club</th>
                  <th className="text-left">University</th>
                  <th className="text-right">Members</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((item) => (
                  <tr key={item.id} data-self={club?.clubId === item.id ? "true" : undefined}>
                    <td>
                      <Link href={`/campus/clubs/${item.id}`} className="font-medium text-forest underline-offset-4 hover:underline">{item.name}</Link>
                      {item.founderName ? <span className="block text-[12px] text-quiet">Founded by {item.founderName}</span> : null}
                    </td>
                    <td className="text-quiet">{item.universityName ?? "None"}</td>
                    <td className="mono text-right">{item.memberCount}</td>
                    <td><ClubStatusTag club={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="start-heading" className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <h2 id="start-heading" className="serif text-2xl text-forest">Start a club</h2>
          {club ? (
            <p className="mt-3 text-sm leading-6 text-quiet">You are in {club.clubName}. A student belongs to one club at a time, so you cannot start another while you are a member.</p>
          ) : (
            <div className="mt-4 rounded-3xl border border-rule bg-paper p-6">
              <CreateClubForm universities={(universities?.data ?? []).map((row) => ({ id: row.id, name: row.name }))} />
            </div>
          )}
        </div>
        <aside className="text-sm leading-6 text-quiet lg:pt-12">
          <p className="text-forest">How clubs work</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The founder and moderators approve or decline applications.</li>
            <li>Only the founder assigns moderators. Nobody can promote themselves.</li>
            <li>A club becomes official only after admin review. Disputes go to the same review.</li>
          </ul>
          <p className="mt-6 flex flex-wrap items-center gap-2">
            <Tag kind="sample">Sample</Tag>
            <Link href="/clubs" className="text-primary underline-offset-4 hover:underline">Sample club directory</Link>
            <span aria-hidden="true">·</span>
            <Link href="/universities" className="text-primary underline-offset-4 hover:underline">Sample universities</Link>
          </p>
        </aside>
      </section>
    </div>
  );
}
