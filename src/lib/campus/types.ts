export type AffiliationStatus = "pending" | "verified" | "rejected";
export type OfficialStatus = "pending_review" | "official" | "not_official";
export type ClubRole = "founder" | "moderator" | "member";
export type MembershipStatus = "pending" | "active" | "rejected" | "withdrawn" | "removed" | "left";

export type Affiliation = {
  id: string;
  universityId: string;
  universityName: string;
  email: string;
  status: AffiliationStatus;
  submittedAt: string;
  decidedAt: string | null;
};

export type ClubState = { officialStatus: OfficialStatus; underDispute: boolean };

export type Membership = ClubState & {
  clubId: string;
  clubName: string;
  role: ClubRole;
  status: MembershipStatus;
  appliedAt: string;
  decidedAt: string | null;
};

export type CampusSummary = {
  affiliation: Affiliation | null;
  club: Membership | null;
  history: Membership[];
  loadError: boolean;
};

export const emptyCampus: CampusSummary = { affiliation: null, club: null, history: [], loadError: false };

export type Label = { text: string; kind: "default" | "provisional" | "unavailable" | "error" };

const AFFILIATION_STATUSES: readonly AffiliationStatus[] = ["pending", "verified", "rejected"];
const OFFICIAL_STATUSES: readonly OfficialStatus[] = ["pending_review", "official", "not_official"];
const ROLES: readonly ClubRole[] = ["founder", "moderator", "member"];
const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ["pending", "active", "rejected", "withdrawn", "removed", "left"];

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const toAffiliationStatus = (value: string) => oneOf(AFFILIATION_STATUSES, value, "pending");
export const toOfficialStatus = (value: string) => oneOf(OFFICIAL_STATUSES, value, "pending_review");
export const toClubRole = (value: string) => oneOf(ROLES, value, "member");
export const toMembershipStatus = (value: string) => oneOf(MEMBERSHIP_STATUSES, value, "pending");

// Unknown values fall back to the least privileged reading: pending, not official, plain member.
export function isOfficial(club: ClubState): boolean {
  return club.officialStatus === "official" && !club.underDispute;
}

export function affiliationLabel(affiliation: Affiliation | null): Label {
  if (!affiliation) return { text: "Not verified", kind: "unavailable" };
  if (affiliation.status === "verified") return { text: `Verified · ${affiliation.universityName}`, kind: "default" };
  if (affiliation.status === "pending") return { text: "Verification pending", kind: "provisional" };
  return { text: "Verification declined", kind: "error" };
}

export function clubStatusLabel(club: ClubState): Label {
  if (club.underDispute) return { text: "Disputed · in admin review", kind: "error" };
  if (club.officialStatus === "official") return { text: "Official club", kind: "default" };
  if (club.officialStatus === "pending_review") return { text: "Not official · pending admin review", kind: "provisional" };
  return { text: "Not official", kind: "unavailable" };
}

export function affiliationShort(affiliation: Affiliation | null): string {
  if (affiliation?.status === "verified") return `Verified, ${affiliation.universityName}`;
  if (affiliation?.status === "pending") return "University pending review";
  return "University not verified";
}

export function campusLine(campus: Pick<CampusSummary, "affiliation" | "club">): string {
  const club = campus.club ? `${roleLabel(campus.club.role)}, ${campus.club.clubName}` : "Individual account";
  return `${club} · ${affiliationShort(campus.affiliation)}`;
}

export function roleLabel(role: ClubRole): string {
  return role === "founder" ? "Founder" : role === "moderator" ? "Moderator" : "Member";
}

export function membershipLabel(membership: Pick<Membership, "status" | "role">): Label {
  switch (membership.status) {
    case "active":
      return { text: roleLabel(membership.role), kind: "default" };
    case "pending":
      return { text: "Application pending", kind: "provisional" };
    case "rejected":
      return { text: "Application declined", kind: "error" };
    case "withdrawn":
      return { text: "Application withdrawn", kind: "unavailable" };
    case "removed":
      return { text: "Removed by a club leader", kind: "unavailable" };
    case "left":
      return { text: "Left the club", kind: "unavailable" };
  }
}

export function isLeader(role: ClubRole | null | undefined): boolean {
  return role === "founder" || role === "moderator";
}

export function canManageMember(actor: ClubRole | null | undefined, target: ClubRole): { remove: boolean; setRole: boolean } {
  if (target === "founder") return { remove: false, setRole: false };
  if (actor === "founder") return { remove: true, setRole: true };
  if (actor === "moderator") return { remove: target === "member", setRole: false };
  return { remove: false, setRole: false };
}
