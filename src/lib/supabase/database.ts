export type ProfileRow = {
  id: string;
  display_name: string;
  class_year: number | null;
  concentration: string | null;
  holdings_public: boolean;
  holdings_public_changed_at: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProfileRow = {
  id: string;
  display_name: string;
  class_year: number | null;
  concentration: string | null;
  member_since: string;
  holdings_public: boolean;
};

export type PublicHoldingRow = {
  ticker: string;
  weight: number | string;
};

export type ClubRow = {
  id: string;
  name: string;
  thesis: string | null;
  university_id: string | null;
  created_by: string | null;
  official_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

export type UniversityRow = { id: string; name: string; short_name: string };
export type UniversityDomainRow = { domain: string; university_id: string };

export type MyAffiliationRow = {
  id: string;
  university_id: string;
  university_name: string;
  email: string;
  status: string;
  submitted_at: string;
  decided_at: string | null;
};

export type MyMembershipRow = {
  club_id: string;
  club_name: string;
  role: string;
  status: string;
  applied_at: string;
  decided_at: string | null;
  official_status: string;
  under_dispute: boolean;
};

export type ClubDirectoryRow = {
  id: string;
  name: string;
  thesis: string | null;
  university_id: string | null;
  university_name: string | null;
  official_status: string;
  under_dispute: boolean;
  is_official: boolean;
  member_count: number;
  founder_id: string | null;
  founder_name: string | null;
  created_at: string;
};

export type ClubRosterRow = { student_id: string; display_name: string; role: string; joined_at: string };
export type ClubApplicationRow = { student_id: string; display_name: string; status: string; applied_at: string; decided_at: string | null };
export type PublicCampusRow = {
  verified_university: string | null;
  club_id: string | null;
  club_name: string | null;
  club_role: string | null;
  club_official: boolean | null;
};
export type AdminReviewRow = { kind: string; item_id: string; club_id: string | null; title: string; detail: string; submitted_at: string };

type ProfileUpdate = Partial<Pick<ProfileRow, "display_name" | "class_year" | "concentration" | "holdings_public" | "onboarded_at">>;

type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: ProfileUpdate;
        Relationships: [];
      };
      universities: ReadOnlyTable<UniversityRow>;
      university_domains: ReadOnlyTable<UniversityDomainRow>;
      clubs: ReadOnlyTable<ClubRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      public_profile: { Args: { target: string }; Returns: PublicProfileRow[] };
      public_holdings: { Args: { target: string }; Returns: PublicHoldingRow[] };
      public_campus: { Args: { target: string }; Returns: PublicCampusRow[] };
      request_university_affiliation: { Args: { p_email: string }; Returns: { id: string; university_id: string; status: string }[] };
      decide_university_affiliation: { Args: { p_affiliation: string; p_decision: string }; Returns: string };
      my_university_affiliation: { Args: Record<string, never>; Returns: MyAffiliationRow[] };
      my_club_memberships: { Args: Record<string, never>; Returns: MyMembershipRow[] };
      create_club: { Args: { p_name: string; p_thesis?: string | null; p_university?: string | null }; Returns: string };
      apply_to_club: { Args: { p_club: string }; Returns: string };
      withdraw_club_application: { Args: { p_club: string }; Returns: string };
      decide_club_application: { Args: { p_club: string; p_student: string; p_decision: string }; Returns: string };
      set_club_member_role: { Args: { p_club: string; p_student: string; p_role: string }; Returns: string };
      remove_club_member: { Args: { p_club: string; p_student: string }; Returns: string };
      leave_club: { Args: { p_club: string }; Returns: string };
      transfer_club_leadership: { Args: { p_club: string; p_student: string }; Returns: string };
      file_club_dispute: { Args: { p_club: string; p_reason: string }; Returns: string };
      review_club: { Args: { p_club: string; p_decision: string }; Returns: string };
      resolve_club_dispute: { Args: { p_dispute: string; p_outcome: string }; Returns: string };
      admin_review_queue: { Args: Record<string, never>; Returns: AdminReviewRow[] };
      club_directory: { Args: { p_club?: string | null }; Returns: ClubDirectoryRow[] };
      club_roster: { Args: { p_club: string }; Returns: ClubRosterRow[] };
      club_applications: { Args: { p_club: string }; Returns: ClubApplicationRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
