import { Tag } from "@/components/ui";
import { affiliationLabel, clubStatusLabel, membershipLabel, type Affiliation, type ClubState, type Membership } from "@/lib/campus/types";

export function AffiliationTag({ affiliation }: { affiliation: Affiliation | null }) {
  const label = affiliationLabel(affiliation);
  return <Tag kind={label.kind}><span data-testid="affiliation-status" data-status={affiliation?.status ?? "none"}>{label.text}</span></Tag>;
}

export function ClubStatusTag({ club }: { club: ClubState }) {
  const label = clubStatusLabel(club);
  const state = club.underDispute ? "disputed" : club.officialStatus;
  return <Tag kind={label.kind}><span data-testid="club-official-status" data-status={state}>{label.text}</span></Tag>;
}

export function MembershipTag({ membership }: { membership: Pick<Membership, "status" | "role"> }) {
  const label = membershipLabel(membership);
  return <Tag kind={label.kind}><span data-testid="membership-status" data-status={membership.status}>{label.text}</span></Tag>;
}
