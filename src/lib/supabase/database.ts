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

type ProfileUpdate = Partial<Pick<ProfileRow, "display_name" | "class_year" | "concentration" | "holdings_public" | "onboarded_at">>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      public_profile: { Args: { target: string }; Returns: PublicProfileRow[] };
      public_holdings: { Args: { target: string }; Returns: PublicHoldingRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
