import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubDirectoryRow, Database, MyAffiliationRow, MyMembershipRow } from "@/lib/supabase/database";
import {
  emptyCampus,
  toAffiliationStatus,
  toClubRole,
  toMembershipStatus,
  toOfficialStatus,
  type Affiliation,
  type CampusSummary,
  type ClubState,
  type Membership,
} from "./types";

export type CampusClient = SupabaseClient<Database>;

export type ClubListing = ClubState & {
  id: string;
  name: string;
  thesis: string | null;
  universityId: string | null;
  universityName: string | null;
  memberCount: number;
  founderId: string | null;
  founderName: string | null;
  createdAt: string;
};

export function toAffiliation(row: MyAffiliationRow): Affiliation {
  return {
    id: row.id,
    universityId: row.university_id,
    universityName: row.university_name,
    email: row.email,
    status: toAffiliationStatus(row.status),
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
  };
}

export function toMembership(row: MyMembershipRow): Membership {
  return {
    clubId: row.club_id,
    clubName: row.club_name,
    role: toClubRole(row.role),
    status: toMembershipStatus(row.status),
    appliedAt: row.applied_at,
    decidedAt: row.decided_at,
    officialStatus: toOfficialStatus(row.official_status),
    underDispute: row.under_dispute,
  };
}

export function toClubListing(row: ClubDirectoryRow): ClubListing {
  return {
    id: row.id,
    name: row.name,
    thesis: row.thesis,
    universityId: row.university_id,
    universityName: row.university_name,
    officialStatus: toOfficialStatus(row.official_status),
    underDispute: row.under_dispute,
    memberCount: row.member_count,
    founderId: row.founder_id,
    founderName: row.founder_name,
    createdAt: row.created_at,
  };
}

export function summarizeCampus(affiliations: MyAffiliationRow[], memberships: MyMembershipRow[]): CampusSummary {
  const all = memberships.map(toMembership);
  return {
    affiliation: affiliations[0] ? toAffiliation(affiliations[0]) : null,
    club: all.find((item) => item.status === "active") ?? null,
    history: all.filter((item) => item.status !== "active"),
    loadError: false,
  };
}

export async function loadCampusSummary(supabase: CampusClient): Promise<CampusSummary> {
  const [affiliation, memberships] = await Promise.all([
    supabase.rpc("my_university_affiliation"),
    supabase.rpc("my_club_memberships"),
  ]);
  if (affiliation.error || memberships.error) return { ...emptyCampus, loadError: true };
  return summarizeCampus(affiliation.data ?? [], memberships.data ?? []);
}
