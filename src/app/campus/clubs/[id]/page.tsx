import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { applyToClub, decideApplication, leaveClub, removeMember, setMemberRole, withdrawApplication } from "@/app/campus/actions";
import { ActionButton } from "@/components/campus/action-button";
import { ClubStatusTag, MembershipTag } from "@/components/campus/campus-tags";
import { DisputeForm } from "@/components/campus/dispute-form";
import { StatusNote, Tag } from "@/components/ui";
import { requireAccount } from "@/lib/account/session";
import { toClubListing, type ClubListing } from "@/lib/campus/load";
import { canManageMember, isLeader, roleLabel, toClubRole, toMembershipStatus, type Membership } from "@/lib/campus/types";
import { shortDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Club · VestEd" };

const clubId = z.uuid();

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await requireAccount(`/campus/clubs/${id}`);
  if (!clubId.safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const [directory, roster] = await Promise.all([
    supabase.rpc("club_directory", { p_club: id }).maybeSingle(),
    supabase.rpc("club_roster", { p_club: id }),
  ]);
  if (directory.error) {
    return <StatusNote kind="error" title="This club could not be loaded" body="The account service did not respond. Reload the page to try again." />;
  }
  if (!directory.data) notFound();
  const club = toClubListing(directory.data);

  const mine: Membership | null =
    account.campus.club?.clubId === id ? account.campus.club : (account.campus.history.find((item) => item.clubId === id) ?? null);
  const myRole = mine?.status === "active" ? mine.role : null;
  const leader = isLeader(myRole);
  const applications = leader ? await supabase.rpc("club_applications", { p_club: id }) : null;
  const members = roster.data ?? [];

  return (
    <div className="mx-auto max-w-[980px]">
      <Link href="/campus" className="text-sm text-primary underline-offset-4 hover:underline">← Campus</Link>
      <header className="mt-3">
        <h1 className="serif text-[40px] leading-[1.1] text-forest" data-testid="club-name">{club.name}</h1>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Club status">
          <li><ClubStatusTag club={club} /></li>
          <li><Tag>{club.universityName ?? "No university"}</Tag></li>
          <li><Tag>{club.memberCount} {club.memberCount === 1 ? "member" : "members"}</Tag></li>
          <li><Tag>Started {shortDate(club.createdAt)}</Tag></li>
        </ul>
        {club.thesis ? <p className="mt-4 max-w-2xl text-sm leading-6 text-ink">{club.thesis}</p> : null}
      </header>

      <div className="mt-6" data-testid="club-review-note">
        <ReviewNote club={club} />
      </div>

      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <section aria-labelledby="roster-heading">
            <h2 id="roster-heading" className="serif text-2xl text-forest">Roster</h2>
            {roster.error ? (
              <div className="mt-4"><StatusNote kind="error" compact title="The roster could not be loaded" body="Reload the page to try again." /></div>
            ) : members.length === 0 ? (
              <div className="mt-4"><StatusNote kind="empty" compact title="No active members" /></div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="v-table" data-testid="club-roster">
                  <thead>
                    <tr>
                      <th className="text-left">Name</th>
                      <th className="text-left">Role</th>
                      <th className="text-left">Joined</th>
                      {leader ? <th className="text-left"><span className="sr-only">Actions</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const role = toClubRole(member.role);
                      const self = member.student_id === account.id;
                      const allowed = self ? { remove: false, setRole: false } : canManageMember(myRole, role);
                      return (
                        <tr key={member.student_id} data-self={self ? "true" : undefined} data-testid={`roster-${member.student_id}`}>
                          <td><Link href={`/students/${member.student_id}`} className="text-forest underline-offset-4 hover:underline">{member.display_name}</Link>{self ? <span className="ml-2 text-[12px] text-quiet">You</span> : null}</td>
                          <td data-testid="roster-role">{roleLabel(role)}</td>
                          <td className="text-quiet">{shortDate(member.joined_at)}</td>
                          {leader ? (
                            <td>
                              <span className="flex flex-wrap gap-2">
                                {allowed.setRole ? (
                                  <ActionButton
                                    action={setMemberRole}
                                    fields={{ clubId: id, studentId: member.student_id, role: role === "moderator" ? "member" : "moderator" }}
                                    label={role === "moderator" ? "Make member" : "Make moderator"}
                                    pendingLabel="Saving…"
                                    className="v-btn quiet small"
                                  />
                                ) : null}
                                {allowed.remove ? (
                                  <ActionButton action={removeMember} fields={{ clubId: id, studentId: member.student_id }} label="Remove" pendingLabel="Removing…" className="v-btn quiet small" />
                                ) : null}
                              </span>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {leader ? (
            <section aria-labelledby="desk-heading" className="mt-12" data-testid="leader-desk">
              <h2 id="desk-heading" className="serif text-2xl text-forest">Applications</h2>
              <p className="mt-1 text-sm text-quiet">{myRole === "founder" ? "As founder you approve members and assign moderators." : "As a moderator you can approve or decline applications."}</p>
              {applications?.error ? (
                <div className="mt-4"><StatusNote kind="error" compact title="Applications could not be loaded" body="Reload the page to try again." /></div>
              ) : (applications?.data ?? []).length === 0 ? (
                <div className="mt-4"><StatusNote kind="empty" compact title="No applications waiting" /></div>
              ) : (
                <ul className="mt-4 divide-y divide-rule border-y border-rule">
                  {(applications?.data ?? []).map((application) => {
                    const status = toMembershipStatus(application.status);
                    return (
                      <li key={application.student_id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm" data-testid={`application-${application.student_id}`}>
                        <span>
                          <Link href={`/students/${application.student_id}`} className="text-forest underline-offset-4 hover:underline">{application.display_name}</Link>
                          <span className="block text-[12px] text-quiet">Applied {shortDate(application.applied_at)}</span>
                        </span>
                        {status === "pending" ? (
                          <span className="flex flex-wrap gap-2">
                            <ActionButton action={decideApplication} fields={{ clubId: id, studentId: application.student_id, decision: "approve" }} label="Approve" pendingLabel="Approving…" />
                            <ActionButton action={decideApplication} fields={{ clubId: id, studentId: application.student_id, decision: "reject" }} label="Decline" pendingLabel="Declining…" className="v-btn quiet small" />
                          </span>
                        ) : (
                          <MembershipTag membership={{ status, role: "member" }} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="membership-heading" className="rounded-3xl bg-wash p-6" data-testid="my-membership">
            <h2 id="membership-heading" className="text-[12px] uppercase tracking-[0.08em] text-quiet">Your membership</h2>
            <MembershipPanel club={club} mine={mine} otherClub={account.campus.club && account.campus.club.clubId !== id ? account.campus.club : null} />
          </section>

          <section aria-labelledby="dispute-heading">
            <h2 id="dispute-heading" className="text-sm text-quiet">Disputes</h2>
            {club.underDispute ? (
              <p className="mt-2 text-sm leading-6 text-forest">A dispute about this club is waiting for admin review. Members and moderators cannot resolve it.</p>
            ) : myRole === "founder" ? (
              <p className="mt-2 text-sm leading-6 text-quiet">Any other student can raise a dispute about this club. An admin reviewer decides it, not the founder or moderators.</p>
            ) : (
              <div className="mt-3"><DisputeForm clubId={id} /></div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReviewNote({ club }: { club: ClubListing }) {
  if (club.underDispute) {
    return (
      <p role="status" className="rounded-2xl border border-[#efd2cc] bg-loss-soft px-5 py-3 text-sm text-forest">
        Disputed. A VestEd admin is reviewing this club. It is not official while the dispute is open, and leadership cannot change until the reviewer decides.
      </p>
    );
  }
  if (club.officialStatus === "official") {
    return <p role="status" className="rounded-2xl border border-pale bg-mint px-5 py-3 text-sm text-forest">Official. A VestEd admin reviewed and approved this club.</p>;
  }
  if (club.officialStatus === "pending_review") {
    return (
      <p role="status" className="rounded-2xl border border-rule bg-paper px-5 py-3 text-sm text-forest">
        Student-created club. It is not official until a VestEd admin reviews and approves it. Members can still join and compete as individuals.
      </p>
    );
  }
  return <p role="status" className="rounded-2xl border border-rule bg-[#f6f7f5] px-5 py-3 text-sm text-forest">Not official. Admin review did not approve this club, and it is not accepting applications.</p>;
}

function MembershipPanel({ club, mine, otherClub }: { club: ClubListing; mine: Membership | null; otherClub: Membership | null }) {
  const fields = { clubId: club.id };
  if (mine?.status === "active") {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="flex items-center gap-2 text-forest"><MembershipTag membership={mine} /> since {shortDate(mine.decidedAt ?? mine.appliedAt)}</p>
        {mine.role === "founder" ? (
          <p className="leading-6 text-quiet">You founded this club. Founders cannot leave, and moderators cannot take over leadership.</p>
        ) : (
          <ActionButton action={leaveClub} fields={fields} label="Leave club" pendingLabel="Leaving…" className="v-btn quiet small" />
        )}
      </div>
    );
  }
  if (mine?.status === "pending") {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="flex items-center gap-2 text-forest"><MembershipTag membership={mine} /> sent {shortDate(mine.appliedAt)}</p>
        <p className="leading-6 text-quiet">The founder or a moderator will approve or decline it.</p>
        <ActionButton action={withdrawApplication} fields={fields} label="Withdraw application" pendingLabel="Withdrawing…" className="v-btn quiet small" />
      </div>
    );
  }
  if (mine?.status === "rejected") {
    return (
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-center gap-2 text-forest"><MembershipTag membership={mine} /></p>
        <p className="leading-6 text-quiet">A club leader declined your application{mine.decidedAt ? ` on ${shortDate(mine.decidedAt)}` : ""}. You still compete as an individual.</p>
      </div>
    );
  }
  if (otherClub) {
    return <p className="mt-3 text-sm leading-6 text-quiet">You are in {otherClub.clubName}. A student belongs to one club at a time.</p>;
  }
  if (club.officialStatus === "not_official") {
    return <p className="mt-3 text-sm leading-6 text-quiet">This club is not accepting applications.</p>;
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      {mine ? <p className="flex items-center gap-2 text-forest"><MembershipTag membership={mine} /></p> : <p className="text-forest">You are not a member.</p>}
      <p className="leading-6 text-quiet">Applying is optional. A leader reviews each application.</p>
      <ActionButton action={applyToClub} fields={fields} label="Apply to join" pendingLabel="Sending…" testId="apply-form" />
    </div>
  );
}
