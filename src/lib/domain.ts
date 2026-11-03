export type DataOrigin = "sample" | "delayed" | "live";

export type University = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  conference: string;
};

export type Club = {
  id: string;
  universityId: string;
  name: string;
  shortName: string;
  founded: number;
  verified: boolean;
  thesis: string;
  leaderId: string;
  moderatorIds: string[];
  aumLabel: string;
};

export type Security = {
  ticker: string;
  name: string;
  sector: string;
  type: "stock" | "etf";
  price: number;
  previousClose: number;
  dayChange: number;
  volume: number;
  marketCap: number;
  description: string;
  holders: number;
};

export type Investor = {
  id: string;
  name: string;
  universityId: string;
  clubId: string | null;
  role: "member" | "moderator" | "leader" | "independent";
  classYear: number;
  concentration: string;
  verified: boolean;
  eligible: boolean;
  publicHoldings: boolean;
  bio: string;
  peakRank: number;
  awards: string[];
};

export type Position = {
  ticker: string;
  quantity: number;
  averageCost: number;
};

export type OrderSide = "buy" | "sell";
export type OrderStatus = "filled" | "rejected";

export type Order = {
  id: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  quotePrice: number;
  fillPrice: number | null;
  status: OrderStatus;
  reason: string;
  submittedAt: string;
};

export type Ledger = {
  cash: number;
  positions: Position[];
  orders: Order[];
  realizedGain: number;
};

export type SeriesPoint = {
  date: string;
  equity: number;
  benchmark: number;
};

export type RoundStatus = "final" | "live" | "scheduled";

export type Round = {
  id: string;
  name: string;
  start: string;
  end: string;
  status: RoundStatus;
};

export type MetricKey =
  | "return"
  | "score"
  | "riskAdjusted"
  | "diversification"
  | "drawdown"
  | "consistency"
  | "relative";

export type ComponentAvailability = "official" | "insufficient" | "educational";

export type ScoreComponent = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  availability: ComponentAvailability;
  weight: number;
  note: string;
};

export type PerformanceSnapshot = {
  returnPct: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  volatility: number | null;
  consistency: number | null;
  relative: number | null;
  score: number | null;
  scoreLabel: "Official" | "Partial" | "Unavailable";
  components: ScoreComponent[];
  observations: number;
};

export type Standing = {
  investorId: string;
  seasonReturn: number;
  roundReturn: number;
  score: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  consistency: number | null;
  relative: number;
  rank: number;
  previousRank: number;
};

export type ClubStanding = {
  clubId: string;
  seasonReturn: number;
  roundReturn: number;
  score: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  consistency: number | null;
  relative: number;
  eligibleMembers: number;
  rank: number;
  previousRank: number;
};

export type UniversityStanding = {
  universityId: string;
  seasonReturn: number;
  roundReturn: number;
  score: number;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number;
  consistency: number | null;
  relative: number;
  eligibleInvestors: number;
  rank: number;
  previousRank: number;
};

export type Headline = {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  summary: string;
  url: string;
  tickers: string[];
  sector: string | null;
  relevance: "holding" | "watchlist" | "market";
};

export type ChatMessage = {
  id: string;
  role: "user" | "professor";
  text: string;
  createdAt: string;
};

export const STARTING_CAPITAL = 100_000;
export const POSITION_FLOOR = 0.02;
export const CASH_DRAG_THRESHOLD = 0.2;
export const SPREAD = 0.01;
export const MIN_DRAWDOWN_OBS = 10;
export const MIN_RISK_OBS = 20;
export const MIN_CONSISTENCY_ROUNDS = 2;
export const SAMPLE_AS_OF = "2026-11-02T20:00:00.000Z";
export const SEASON_ANCHOR = "2026-11-02T16:00:00.000Z";
export const DEMO_INVESTOR_ID = "maya-chen";
