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

// Ledger rows. Numeric columns are read with a ::text cast so money stays a decimal string.
export type SeasonRow = { id: string; name: string; starts_at: string; ends_at: string; starting_capital: string };
export type RoundRow = { id: string; season_id: string; number: number; name: string; starts_at: string; ends_at: string };
export type InstrumentRow = { id: string; name: string; kind: string; sector: string | null; tradable: boolean };
export type QuoteRow = { id: string; instrument_id: string; price: string; as_of: string; source: "sample" | "licensed"; recorded_at: string };
export type MarketCalendarRow = { session_date: string; closed: boolean; close_time: string | null; note: string };
export type RegistrationRow = { id: string; season_id: string; student_id: string; starting_capital: string; cash: string; registered_at: string };
export type OrderRow = {
  id: string;
  registration_id: string;
  student_id: string;
  instrument_id: string;
  side: "buy" | "sell";
  quantity: number;
  time_in_force: "day";
  idempotency_key: string;
  status: "accepted" | "filled" | "rejected" | "cancelled" | "expired";
  accepted_at: string;
  eligible_at: string;
  expires_at: string;
  reference_quote_id: string | null;
  reference_price: string | null;
  closed_at: string | null;
  reason: string | null;
};
export type OrderReservationRow = {
  order_id: string;
  registration_id: string;
  student_id: string;
  kind: "cash" | "shares";
  instrument_id: string;
  amount: string;
  held_at: string;
  released_at: string | null;
  release_reason: string | null;
};
export type ExecutionRow = {
  id: string;
  order_id: string;
  registration_id: string;
  student_id: string;
  instrument_id: string;
  side: "buy" | "sell";
  quantity: number;
  quote_id: string;
  price: string;
  gross: string;
  simulation_cost: string;
  net_cash: string;
  realized: string | null;
  executed_at: string;
  recorded_at: string;
};
export type CashLedgerRow = {
  id: number;
  registration_id: string;
  student_id: string;
  kind: "opening" | "trade" | "simulation_cost";
  amount: string;
  order_id: string | null;
  execution_id: string | null;
  memo: string;
  created_at: string;
};
export type PositionRow = { registration_id: string; student_id: string; instrument_id: string; quantity: string; cost_basis: string; updated_at: string };
export type LatestQuoteRow = { instrument_id: string; quote_id: string; price: string; as_of: string; source: "sample" | "licensed" };
export type OrderWindowRow = { eligible_at: string; expires_at: string };

// Standings rows. Figures are read as text so the board formats them from stored values.
export type UniversityAffiliationRow = {
  id: string;
  student_id: string;
  university_id: string;
  email: string;
  status: "pending" | "verified" | "rejected";
  submitted_at: string;
  decided_at: string | null;
};
export type ClubMembershipRow = {
  club_id: string;
  student_id: string;
  role: "founder" | "moderator" | "member";
  status: "pending" | "active" | "rejected" | "withdrawn" | "removed" | "left";
  applied_at: string;
};
export type ValuationSnapshotRow = {
  id: number;
  registration_id: string;
  student_id: string;
  season_id: string;
  valued_at: string;
  status: "valued" | "unavailable";
  equity: string | null;
  cash: string;
  holdings: Array<{ instrument_id: string; sector: string | null; value: string }>;
  missing: string[];
  recorded_at: string;
};
export type StandingsVersionRow = { id: string; season_id: string; round_id: string | null; board: string; as_of: string; computed_at: string };
type StandingFigureColumns = {
  entrant_id: string;
  entrant_name: string;
  university_id: string | null;
  club_id: string | null;
  rank: number | null;
  return_pct: string | null;
  score: string | null;
  score_label: string | null;
  risk_adjusted: string | null;
  drawdown: string | null;
  diversification: string | null;
  consistency: string | null;
  eligible_students: number | null;
  institutional: boolean | null;
  withheld: string[];
  included: string[];
};
export type StandingEntryRow = StandingFigureColumns & { version_id: string };
export type RoundClosureRow = { round_id: string; closed_at: string; recorded_at: string };
export type FinalizedResultRow = StandingFigureColumns & {
  id: string;
  round_id: string;
  season_id: string;
  board: string;
  edition: number;
  supersedes: string | null;
  finalized_at: string;
  correction_reason: string | null;
  recorded_at: string;
};
export type LatestStandingRow = StandingFigureColumns & { round_id: string | null; board: string; as_of: string };
export type CurrentFinalizedRow = StandingFigureColumns & {
  id: string;
  round_id: string;
  season_id: string;
  board: string;
  edition: number;
  finalized_at: string;
};
export type WatchlistRow = { student_id: string; instrument_id: string; added_at: string };
export type AiSessionRow = { id: string; student_id: string; title: string; created_at: string; updated_at: string };
export type AiMessageRow = {
  id: number;
  session_id: string;
  student_id: string;
  role: "student" | "professor";
  body: string;
  reply_status: "demonstration" | "unavailable" | null;
  context: Json | null;
  created_at: string;
};
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
      seasons: ReadOnlyTable<SeasonRow>;
      rounds: ReadOnlyTable<RoundRow>;
      instruments: ReadOnlyTable<InstrumentRow>;
      quotes: ReadOnlyTable<QuoteRow>;
      market_calendar: ReadOnlyTable<MarketCalendarRow>;
      registrations: ReadOnlyTable<RegistrationRow>;
      orders: ReadOnlyTable<OrderRow>;
      order_reservations: ReadOnlyTable<OrderReservationRow>;
      executions: ReadOnlyTable<ExecutionRow>;
      cash_ledger: ReadOnlyTable<CashLedgerRow>;
      positions: ReadOnlyTable<PositionRow>;
      university_affiliations: ReadOnlyTable<UniversityAffiliationRow>;
      club_memberships: ReadOnlyTable<ClubMembershipRow>;
      valuation_snapshots: ReadOnlyTable<ValuationSnapshotRow>;
      standings_versions: ReadOnlyTable<StandingsVersionRow>;
      standing_entries: ReadOnlyTable<StandingEntryRow>;
      round_closures: ReadOnlyTable<RoundClosureRow>;
      finalized_results: ReadOnlyTable<FinalizedResultRow>;
      watchlists: ReadOnlyTable<WatchlistRow>;
      ai_sessions: ReadOnlyTable<AiSessionRow>;
      ai_messages: ReadOnlyTable<AiMessageRow>;
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
      register_for_season: { Args: { p_season?: string | null }; Returns: Json };
      place_order: { Args: { p_instrument: string; p_side: string; p_quantity: number; p_idempotency_key: string }; Returns: Json };
      cancel_order: { Args: { p_order: string }; Returns: Json };
      latest_quotes: { Args: { p_at?: string }; Returns: LatestQuoteRow[] };
      ledger_order_window: { Args: { p_accepted_at: string }; Returns: OrderWindowRow[] };
      ledger_buy_reserve: { Args: { p_quantity: number; p_price: number | string }; Returns: number };
      ledger_create_season: { Args: { p_id: string; p_name: string; p_starts_at: string; p_rounds: number }; Returns: string };
      ledger_register: { Args: { p_student: string; p_season: string | null; p_at: string }; Returns: string };
      ledger_accept_order: {
        Args: { p_student: string; p_instrument: string; p_side: string; p_quantity: number; p_idempotency_key: string; p_at: string };
        Returns: Json;
      };
      ledger_cancel_order: { Args: { p_student: string; p_order: string; p_at: string }; Returns: Json };
      ledger_fill_order: { Args: { p_order: string; p_quote: string; p_at: string }; Returns: Json };
      ledger_expire_order: { Args: { p_order: string; p_at: string }; Returns: boolean };
      standings_record_valuation: {
        Args: { p_registration: string; p_valued_at: string; p_status: string; p_equity: string | null; p_missing: string[] };
        Returns: number | null;
      };
      standings_publish: { Args: { p_season: string; p_round: string | null; p_board: string; p_as_of: string; p_entries: Json }; Returns: string };
      standings_finalize_round: { Args: { p_round: string; p_closed_at: string; p_results: Json }; Returns: string };
      standings_correct_result: { Args: { p_result: string; p_changes: Json; p_reason: string; p_at: string }; Returns: string };
      latest_standings: { Args: { p_season: string }; Returns: LatestStandingRow[] };
      current_finalized_results: { Args: { p_season?: string | null }; Returns: CurrentFinalizedRow[] };
      watchlist_add: { Args: { p_instrument: string }; Returns: string };
      watchlist_remove: { Args: { p_instrument: string }; Returns: boolean };
      professor_record_turn: {
        Args: { p_student: string; p_session: string | null; p_question: string; p_reply_status: string; p_reply: string; p_context: Json };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
