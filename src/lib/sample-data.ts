import {
  DEMO_INVESTOR_ID,
  SAMPLE_AS_OF,
  STARTING_CAPITAL,
  type Club,
  type ClubStanding,
  type Headline,
  type Investor,
  type Ledger,
  type Round,
  type Security,
  type SeriesPoint,
  type Standing,
  type University,
  type UniversityStanding,
} from "./domain";

export const universities: University[] = [
  { id: "michigan", name: "University of Michigan", shortName: "Michigan", city: "Ann Arbor", conference: "Big Ten" },
  { id: "penn", name: "University of Pennsylvania", shortName: "Pennsylvania", city: "Philadelphia", conference: "Ivy" },
  { id: "texas", name: "University of Texas", shortName: "Texas", city: "Austin", conference: "SEC" },
  { id: "virginia", name: "University of Virginia", shortName: "Virginia", city: "Charlottesville", conference: "ACC" },
  { id: "nyu", name: "New York University", shortName: "NYU", city: "New York", conference: "Independent" },
  { id: "berkeley", name: "University of California, Berkeley", shortName: "Berkeley", city: "Berkeley", conference: "Pac-12" },
  { id: "notre-dame", name: "University of Notre Dame", shortName: "Notre Dame", city: "Notre Dame", conference: "Independent" },
  { id: "georgetown", name: "Georgetown University", shortName: "Georgetown", city: "Washington", conference: "Big East" },
];

export const securities: Security[] = [
  { ticker: "AAPL", name: "Apple", sector: "Technology", type: "stock", price: 228.42, previousClose: 226.1, dayChange: 0.0103, volume: 48_200_000, marketCap: 3_450_000_000_000, holders: 41, description: "Consumer hardware, software, and services. Widely held as a quality compounder in student books." },
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", type: "stock", price: 418.65, previousClose: 421.2, dayChange: -0.0061, volume: 22_400_000, marketCap: 3_110_000_000_000, holders: 46, description: "Enterprise software, cloud infrastructure, and productivity. A core holding across club portfolios." },
  { ticker: "NVDA", name: "NVIDIA", sector: "Technology", type: "stock", price: 136.8, previousClose: 132.4, dayChange: 0.0332, volume: 210_000_000, marketCap: 3_360_000_000_000, holders: 38, description: "Accelerated computing. High attention, high volatility, and a frequent source of concentration risk." },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", type: "stock", price: 224.15, previousClose: 223.4, dayChange: 0.0034, volume: 8_600_000, marketCap: 630_000_000_000, holders: 29, description: "Diversified US bank. Often used by clubs as a rates and credit expression." },
  { ticker: "UNH", name: "UnitedHealth", sector: "Health care", type: "stock", price: 542.3, previousClose: 548.9, dayChange: -0.012, volume: 3_400_000, marketCap: 500_000_000_000, holders: 18, description: "Managed care and health services. Sensitive to policy and medical-cost headlines." },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", type: "stock", price: 118.74, previousClose: 117.9, dayChange: 0.0071, volume: 14_100_000, marketCap: 520_000_000_000, holders: 16, description: "Integrated energy. A common inflation and commodity hedge in student mandates." },
  { ticker: "CAT", name: "Caterpillar", sector: "Industrials", type: "stock", price: 392.5, previousClose: 389.2, dayChange: 0.0085, volume: 2_800_000, marketCap: 190_000_000_000, holders: 14, description: "Machinery and infrastructure demand. Cyclical, with a long industrial cycle." },
  { ticker: "AMZN", name: "Amazon", sector: "Consumer discretionary", type: "stock", price: 198.4, previousClose: 196.7, dayChange: 0.0086, volume: 36_000_000, marketCap: 2_080_000_000_000, holders: 33, description: "Retail, advertising, and cloud. Often overlaps with other large technology holdings." },
  { ticker: "LLY", name: "Eli Lilly", sector: "Health care", type: "stock", price: 812.6, previousClose: 804.2, dayChange: 0.0104, volume: 2_900_000, marketCap: 770_000_000_000, holders: 21, description: "Pharmaceuticals with unusual index weight. Position size matters more than the story." },
  { ticker: "COST", name: "Costco", sector: "Consumer staples", type: "stock", price: 892.15, previousClose: 888.4, dayChange: 0.0042, volume: 1_700_000, marketCap: 395_000_000_000, holders: 19, description: "Membership retail. Defensive cash flows with a premium multiple." },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", sector: "Broad market", type: "etf", price: 572.4, previousClose: 570.1, dayChange: 0.004, volume: 62_000_000, marketCap: 580_000_000_000, holders: 27, description: "Sample benchmark vehicle and a permitted ETF. Holding SPY is not the same as outperforming it." },
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", sector: "Broad market", type: "etf", price: 286.9, previousClose: 285.7, dayChange: 0.0042, volume: 4_200_000, marketCap: 420_000_000_000, holders: 11, description: "Total US equity market ETF. Counts as one holding, not as instant diversification across sectors." },
];

export const clubs: Club[] = [
  { id: "mia", universityId: "michigan", name: "Michigan Investment Association", shortName: "MIA", founded: 1998, verified: true, thesis: "Bottom-up quality compounders with an explicit drawdown budget.", leaderId: "elena-vasquez", moderatorIds: ["jordan-hale"], aumLabel: "Equal-weight member books" },
  { id: "wharton-pmc", universityId: "penn", name: "Wharton Portfolio Management Club", shortName: "Wharton PMC", founded: 1982, verified: true, thesis: "Sector-neutral core with a satellite of special situations.", leaderId: "priya-shah", moderatorIds: ["owen-blake"], aumLabel: "Equal-weight member books" },
  { id: "texas-uic", universityId: "texas", name: "Texas University Investment Club", shortName: "Texas UIC", founded: 1994, verified: true, thesis: "Energy fluency plus US large-cap quality.", leaderId: "marcus-reed", moderatorIds: ["lucia-nguyen"], aumLabel: "Equal-weight member books" },
  { id: "mcintire", universityId: "virginia", name: "McIntire Investment Institute", shortName: "MII", founded: 1994, verified: true, thesis: "Long-duration franchises, low turnover.", leaderId: "hannah-brooks", moderatorIds: ["samuel-ortiz"], aumLabel: "Equal-weight member books" },
  { id: "nyu-iic", universityId: "nyu", name: "NYU Investment Analysis Group", shortName: "IAG", founded: 2001, verified: true, thesis: "Research process over theme chasing.", leaderId: "daniel-cho", moderatorIds: ["amira-hassan"], aumLabel: "Equal-weight member books" },
  { id: "berkeley-fig", universityId: "berkeley", name: "Berkeley Finance Investment Group", shortName: "FIG", founded: 1996, verified: true, thesis: "Technology literacy without single-name concentration.", leaderId: "sofia-alvarez", moderatorIds: ["nate-kim"], aumLabel: "Equal-weight member books" },
  { id: "nd-invest", universityId: "notre-dame", name: "Notre Dame Investment Club", shortName: "NDIC", founded: 1990, verified: true, thesis: "Dividend growth and industrial cycle.", leaderId: "claire-donovan", moderatorIds: ["patrick-omeara"], aumLabel: "Equal-weight member books" },
  { id: "georgetown-gib", universityId: "georgetown", name: "Georgetown Investment Board", shortName: "GIB", founded: 1988, verified: true, thesis: "Policy-aware financials and health care.", leaderId: "william-adebayo", moderatorIds: ["grace-lin"], aumLabel: "Equal-weight member books" },
];

export const investors: Investor[] = [
  investor("maya-chen", "Maya Chen", "michigan", "mia", "member", 2027, "Finance", true, true, false, "Covers industrials and quality compounders for MIA. Prefers positions she can defend in a weekly memo.", 4, ["Round 2 relative-performance note"]),
  investor("elena-vasquez", "Elena Vasquez", "michigan", "mia", "leader", 2026, "Business economics", true, true, true, "MIA president. Publishes holdings so newer members can see sizing, not just tickers.", 3, ["Fall 2025 club captain"]),
  investor("jordan-hale", "Jordan Hale", "michigan", "mia", "moderator", 2026, "Accounting", true, true, false, "Runs the club's drawdown review before each round close.", 18, []),
  investor("priya-shah", "Priya Shah", "penn", "wharton-pmc", "leader", 2026, "Finance", true, true, true, "Builds sector-neutral cores and writes the club's benchmark memo.", 1, ["Spring 2026 individual champion"]),
  investor("owen-blake", "Owen Blake", "penn", "wharton-pmc", "moderator", 2027, "Statistics", true, true, false, "Focuses on position limits and what does not belong in a three-week round.", 6, []),
  investor("marcus-reed", "Marcus Reed", "texas", "texas-uic", "leader", 2026, "Energy finance", true, true, true, "Treats energy as a research edge, not a costume.", 5, ["Fall 2025 university record"]),
  investor("lucia-nguyen", "Lucia Nguyen", "texas", "texas-uic", "moderator", 2027, "Finance", true, true, false, "Covers refiners and integrated oils.", 11, []),
  investor("hannah-brooks", "Hannah Brooks", "virginia", "mcintire", "leader", 2026, "Commerce", true, true, true, "Low turnover, long memos, fewer trades.", 2, ["Consistency citation, Spring 2026"]),
  investor("samuel-ortiz", "Samuel Ortiz", "virginia", "mcintire", "moderator", 2027, "Commerce", true, true, false, "Tracks franchise quality and valuation discipline.", 9, []),
  investor("daniel-cho", "Daniel Cho", "nyu", "nyu-iic", "leader", 2026, "Finance", true, true, false, "Writes the group's weekly what-changed note.", 8, []),
  investor("amira-hassan", "Amira Hassan", "nyu", "nyu-iic", "moderator", 2027, "Economics", true, true, true, "Publishes a concentrated financials book and explains the risk plainly.", 14, []),
  investor("sofia-alvarez", "Sofia Alvarez", "berkeley", "berkeley-fig", "leader", 2026, "Economics", true, true, true, "Pushes the club to separate technology knowledge from technology concentration.", 7, []),
  investor("nate-kim", "Nate Kim", "berkeley", "berkeley-fig", "moderator", 2028, "Data science", true, true, false, "First full season. Risk statistics remain educational until the window is long enough.", 22, []),
  investor("claire-donovan", "Claire Donovan", "notre-dame", "nd-invest", "leader", 2026, "Finance", true, true, false, "Runs a dividend-growth sleeve with an industrial tilt.", 10, []),
  investor("patrick-omeara", "Patrick O'Meara", "notre-dame", "nd-invest", "moderator", 2027, "Accountancy", true, true, false, "Reviews payout safety, not yield alone.", 16, []),
  investor("william-adebayo", "William Adebayo", "georgetown", "georgetown-gib", "leader", 2026, "Finance", true, true, true, "Policy and bank research lead.", 12, []),
  investor("grace-lin", "Grace Lin", "georgetown", "georgetown-gib", "moderator", 2027, "International economics", true, true, false, "Covers managed care and reimbursement.", 15, []),
  investor("iris-patel", "Iris Patel", "michigan", null, "independent", 2028, "Economics", true, true, true, "Competes unaffiliated. Verification is complete, so her results count at the university level.", 13, []),
  investor("leo-martin", "Leo Martin", "penn", "wharton-pmc", "member", 2028, "Finance", false, false, false, "Affiliation is pending. Individual open board only until verification clears.", 0, []),
  investor("nina-kowalski", "Nina Kowalski", "virginia", null, "independent", 2027, "Commerce", true, true, false, "Independent investor with a staples and health-care tilt.", 17, []),
];

export const rounds: Round[] = [
  { id: "r1", name: "Round 1", start: "2026-08-24", end: "2026-09-11T21:00:00.000Z", status: "final" },
  { id: "r2", name: "Round 2", start: "2026-09-14", end: "2026-10-02T21:00:00.000Z", status: "final" },
  { id: "r3", name: "Round 3", start: "2026-10-05", end: "2026-10-23T21:00:00.000Z", status: "final" },
  { id: "r4", name: "Round 4", start: "2026-10-26", end: "2026-11-13T21:00:00.000Z", status: "live" },
  { id: "r5", name: "Round 5", start: "2026-11-16", end: "2026-12-04T21:00:00.000Z", status: "scheduled" },
];

const benchmarkMoves = [
  0.004, 0.002, -0.003, 0.005, 0.001, 0.003, -0.002, 0.004, 0.002, 0.001,
  -0.004, 0.003, 0.002, 0.005, -0.001, 0.002, 0.003, -0.002, 0.004, 0.001,
  0.002, -0.003, 0.004, 0.001, 0.003, 0.002, -0.001, 0.002, 0.004, -0.002,
  0.001, 0.003, 0.002, -0.004, 0.003, 0.001, 0.002, 0.004, -0.001, 0.002,
  0.001, 0.003, -0.002, 0.002, 0.001,
];

export const benchmarkSeries: SeriesPoint[] = buildSeries(STARTING_CAPITAL, [
  0.004, 0.002, -0.003, 0.005, 0.001, 0.003, -0.002, 0.004, 0.002, 0.001,
  -0.004, 0.003, 0.002, 0.005, -0.001, 0.002, 0.003, -0.002, 0.004, 0.001,
  0.002, -0.003, 0.004, 0.001, 0.003, 0.002, -0.001, 0.002, 0.004, -0.002,
  0.001, 0.003, 0.002, -0.004, 0.003, 0.001, 0.002, 0.004, -0.001, 0.002,
  0.001, 0.003, -0.002, 0.002, 0.001,
], "2026-08-24");

const mayaPath = [
  0.006, 0.004, -0.002, 0.008, 0.003, 0.002, -0.005, 0.007, 0.004, 0.001,
  -0.003, 0.006, 0.002, 0.009, -0.004, 0.003, 0.005, -0.006, 0.004, 0.002,
  0.003, -0.002, 0.007, 0.001, 0.004, 0.003, -0.008, 0.005, 0.006, -0.003,
  0.002, 0.004, 0.001, -0.005, 0.006, 0.002, 0.003, 0.005, -0.002, 0.004,
  0.002, 0.003, -0.001, 0.004, 0.002,
];

export const mayaSeries: SeriesPoint[] = buildSeries(STARTING_CAPITAL, mayaPath, "2026-08-24");

export const canonicalLedger: Ledger = {
  cash: 8420.55,
  realizedGain: 640.18,
  positions: [
    { ticker: "MSFT", quantity: 42, averageCost: 402.15 },
    { ticker: "CAT", quantity: 28, averageCost: 368.4 },
    { ticker: "JPM", quantity: 46, averageCost: 214.8 },
    { ticker: "COST", quantity: 12, averageCost: 864.2 },
    { ticker: "AAPL", quantity: 36, averageCost: 214.5 },
    { ticker: "XOM", quantity: 40, averageCost: 112.3 },
    { ticker: "LLY", quantity: 6, averageCost: 790.4 },
  ],
  orders: [
    { id: "ord-seed-1", ticker: "CAT", side: "buy", quantity: 4, quotePrice: 389.2, fillPrice: 389.21, status: "filled", reason: "Sample opening fill. Not a live execution.", submittedAt: "2026-10-28T14:35:00.000Z" },
    { id: "ord-seed-2", ticker: "AAPL", side: "sell", quantity: 4, quotePrice: 226.1, fillPrice: 226.09, status: "filled", reason: "Sample trim. Realized against average cost.", submittedAt: "2026-10-21T15:05:00.000Z" },
    { id: "ord-seed-3", ticker: "JPM", side: "buy", quantity: 10, quotePrice: 218.4, fillPrice: 218.41, status: "filled", reason: "Sample add after the club memo.", submittedAt: "2026-10-09T14:15:00.000Z" },
  ],
};

export const watchlist = ["NVDA", "AMZN", "UNH", "SPY"];

export const individualStandings: Standing[] = [
  standing("priya-shah", 0.086, 0.021, 81.4, 1.42, -0.041, 0.78, 0.75, 0.031, 1, 1),
  standing("hannah-brooks", 0.079, 0.012, 79.1, 1.35, -0.028, 0.81, 0.9, 0.024, 2, 3),
  standing("elena-vasquez", 0.074, 0.018, 76.8, 1.21, -0.046, 0.74, 0.7, 0.019, 3, 2),
  standing("maya-chen", 0.0684, 0.0142, 74.6, 1.08, -0.052, 0.72, 0.66, 0.0134, 4, 6),
  standing("marcus-reed", 0.066, 0.009, 73.2, 0.98, -0.061, 0.69, 0.62, 0.011, 5, 4),
  standing("owen-blake", 0.061, 0.016, 71.5, 1.11, -0.039, 0.7, 0.58, 0.006, 6, 7),
  standing("sofia-alvarez", 0.058, 0.011, 70.1, 0.92, -0.057, 0.76, 0.55, 0.003, 7, 5),
  standing("daniel-cho", 0.054, 0.008, 68.4, 0.84, -0.048, 0.67, 0.6, -0.001, 8, 9),
  standing("samuel-ortiz", 0.051, 0.006, 66.9, 0.88, -0.033, 0.73, 0.64, -0.004, 9, 8),
  standing("claire-donovan", 0.047, 0.004, 64.2, 0.73, -0.044, 0.66, 0.5, -0.008, 10, 11),
  standing("lucia-nguyen", 0.044, 0.013, 63.1, 0.69, -0.066, 0.61, 0.48, -0.011, 11, 12),
  standing("william-adebayo", 0.041, 0.002, 61.4, 0.64, -0.051, 0.68, 0.5, -0.014, 12, 10),
  standing("iris-patel", 0.039, 0.01, 60.2, 0.58, -0.049, 0.63, 0.42, -0.016, 13, 14),
  standing("amira-hassan", 0.036, -0.004, 58.7, 0.41, -0.082, 0.42, 0.4, -0.019, 14, 13),
  standing("grace-lin", 0.031, 0.001, 56.5, 0.37, -0.058, 0.59, 0.38, -0.024, 15, 16),
  standing("patrick-omeara", 0.028, -0.002, 54.8, 0.29, -0.063, 0.57, 0.36, -0.027, 16, 15),
  standing("nina-kowalski", 0.022, 0.003, 52.4, 0.22, -0.047, 0.64, 0.3, -0.033, 17, 18),
  standing("jordan-hale", 0.019, -0.006, 50.1, 0.14, -0.071, 0.55, 0.28, -0.036, 18, 17),
];

export const clubStandings: ClubStanding[] = [
  clubStanding("wharton-pmc", 0.0735, 0.0185, 76.4, 1.26, -0.04, 0.74, 0.66, 0.0185, 14, 1, 1),
  clubStanding("mcintire", 0.065, 0.009, 73.0, 1.11, -0.031, 0.77, 0.77, 0.01, 11, 2, 2),
  clubStanding("mia", 0.0538, 0.0087, 67.2, 0.81, -0.056, 0.67, 0.55, -0.0012, 3, 3, 4),
  clubStanding("texas-uic", 0.055, 0.011, 68.1, 0.83, -0.063, 0.65, 0.55, 0, 12, 4, 3),
  clubStanding("berkeley-fig", 0.049, 0.008, 64.6, 0.7, -0.06, 0.7, 0.48, -0.006, 10, 5, 5),
  clubStanding("nyu-iic", 0.045, 0.002, 63.5, 0.62, -0.065, 0.54, 0.5, -0.01, 9, 6, 6),
  clubStanding("nd-invest", 0.0375, 0.001, 59.5, 0.51, -0.053, 0.61, 0.43, -0.017, 8, 7, 7),
  clubStanding("georgetown-gib", 0.036, 0.0015, 58.9, 0.5, -0.054, 0.63, 0.44, -0.019, 8, 8, 8),
];

export const universityStandings: UniversityStanding[] = [
  uniStanding("penn", 0.071, 0.017, 75.2, 1.2, -0.041, 0.73, 0.64, 0.016, 18, 1, 1),
  uniStanding("virginia", 0.0507, 0.007, 67.8, 0.82, -0.036, 0.73, 0.61, -0.004, 16, 2, 2),
  uniStanding("michigan", 0.0501, 0.0091, 65.4, 0.75, -0.054, 0.66, 0.51, -0.005, 22, 3, 3),
  uniStanding("texas", 0.055, 0.011, 68.1, 0.83, -0.063, 0.65, 0.55, 0, 15, 4, 4),
  uniStanding("berkeley", 0.049, 0.008, 64.6, 0.7, -0.06, 0.7, 0.48, -0.006, 14, 5, 5),
  uniStanding("nyu", 0.045, 0.002, 63.5, 0.62, -0.065, 0.54, 0.5, -0.01, 13, 6, 6),
  uniStanding("notre-dame", 0.0375, 0.001, 59.5, 0.51, -0.053, 0.61, 0.43, -0.017, 11, 7, 7),
  uniStanding("georgetown", 0.036, 0.0015, 58.9, 0.5, -0.054, 0.63, 0.44, -0.019, 10, 8, 8),
];

export const archivedChampions = [
  { season: "Fall 2025", individual: "Priya Shah", club: "Wharton Portfolio Management Club", university: "Pennsylvania" },
  { season: "Spring 2026", individual: "Hannah Brooks", club: "McIntire Investment Institute", university: "Virginia" },
];

export const headlines: Headline[] = [
  { id: "n1", title: "Industrial orders steady as equipment backlogs hold", publisher: "Sample Desk", publishedAt: "2026-11-02T13:10:00.000Z", summary: "A sample brief on machinery demand. Written for the prototype, not filed by a wire service.", url: "https://example.com/vested/industrial-orders", tickers: ["CAT"], sector: "Industrials", relevance: "holding" },
  { id: "n2", title: "Large banks guide to stable net interest income", publisher: "Sample Desk", publishedAt: "2026-11-01T15:40:00.000Z", summary: "Sample commentary on bank guidance. It does not quote a live filing.", url: "https://example.com/vested/bank-guidance", tickers: ["JPM"], sector: "Financials", relevance: "holding" },
  { id: "n3", title: "Cloud growth remains the debate inside large software", publisher: "Campus Markets Review", publishedAt: "2026-10-31T18:05:00.000Z", summary: "Educational sample note on how students should separate cloud growth from position size.", url: "https://example.com/vested/cloud-growth", tickers: ["MSFT", "AMZN"], sector: "Technology", relevance: "holding" },
  { id: "n4", title: "Managed-care costs return to the weekly research agenda", publisher: "Sample Desk", publishedAt: "2026-10-30T14:20:00.000Z", summary: "Sample briefing for students watching health-care policy risk.", url: "https://example.com/vested/managed-care", tickers: ["UNH"], sector: "Health care", relevance: "watchlist" },
  { id: "n5", title: "Chip volatility is not a research process", publisher: "Campus Markets Review", publishedAt: "2026-10-29T16:00:00.000Z", summary: "Sample teaching note on why a fast tape does not improve a three-week score by itself.", url: "https://example.com/vested/chip-volatility", tickers: ["NVDA"], sector: "Technology", relevance: "watchlist" },
  { id: "n6", title: "What the sample S&P path implies for round 4", publisher: "VestEd Methodology", publishedAt: "2026-10-28T12:00:00.000Z", summary: "Explains the frozen benchmark path used in this prototype. It is not a live index level.", url: "https://example.com/vested/benchmark-path", tickers: ["SPY"], sector: null, relevance: "market" },
  { id: "n7", title: "Membership retailers keep traffic, multiples stay rich", publisher: "Sample Desk", publishedAt: "2026-10-27T19:15:00.000Z", summary: "Sample note on staples exposure and why a defensive business can still be a valuation risk.", url: "https://example.com/vested/membership-retail", tickers: ["COST"], sector: "Consumer staples", relevance: "holding" },
  { id: "n8", title: "Energy cash returns versus a student drawdown budget", publisher: "Campus Markets Review", publishedAt: "2026-10-26T14:45:00.000Z", summary: "Sample discussion of integrated oil as a hedge, and the weeks when it is not one.", url: "https://example.com/vested/energy-budget", tickers: ["XOM"], sector: "Energy", relevance: "holding" },
];

export const seasonMeta = {
  id: "fall-2026",
  name: "Fall 2026",
  asOf: SAMPLE_AS_OF,
  quoteLabel: "Sample quotes, fixed for this build",
  standingsLabel: "Frozen sample standings, except Maya Chen's provisional book",
  benchmarkReturn: benchmarkSeries[benchmarkSeries.length - 1].benchmark / STARTING_CAPITAL - 1,
};

export function securityByTicker(ticker: string): Security | undefined {
  return securities.find((security) => security.ticker === ticker);
}

export function investorById(id: string): Investor | undefined {
  return investors.find((investor) => investor.id === id);
}

export function clubById(id: string): Club | undefined {
  return clubs.find((club) => club.id === id);
}

export function universityById(id: string): University | undefined {
  return universities.find((university) => university.id === id);
}

export function clubMembers(clubId: string): Investor[] {
  return investors.filter((investor) => investor.clubId === clubId);
}

export function universityInvestors(universityId: string): Investor[] {
  return investors.filter((investor) => investor.universityId === universityId);
}

export function currentRound(): Round {
  return rounds.find((round) => round.status === "live") ?? rounds[3];
}

export function roundProgress(now = new Date()): number {
  const round = currentRound();
  const start = new Date(round.start).getTime();
  const end = new Date(round.end).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function seasonProgress(now = new Date()): number {
  const start = new Date(rounds[0].start).getTime();
  const end = new Date(rounds[rounds.length - 1].end).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function demoInvestor(): Investor {
  return investorById(DEMO_INVESTOR_ID)!;
}

function investor(
  id: string,
  name: string,
  universityId: string,
  clubId: string | null,
  role: Investor["role"],
  classYear: number,
  concentration: string,
  verified: boolean,
  eligible: boolean,
  publicHoldings: boolean,
  bio: string,
  peakRank: number,
  awards: string[],
): Investor {
  return { id, name, universityId, clubId, role, classYear, concentration, verified, eligible, publicHoldings, bio, peakRank, awards };
}

function standing(
  investorId: string,
  seasonReturn: number,
  roundReturn: number,
  score: number,
  riskAdjusted: number | null,
  drawdown: number | null,
  diversification: number,
  consistency: number | null,
  relative: number,
  rank: number,
  previousRank: number,
): Standing {
  return { investorId, seasonReturn, roundReturn, score, riskAdjusted, drawdown, diversification, consistency, relative, rank, previousRank };
}

function clubStanding(
  clubId: string,
  seasonReturn: number,
  roundReturn: number,
  score: number,
  riskAdjusted: number | null,
  drawdown: number | null,
  diversification: number,
  consistency: number | null,
  relative: number,
  eligibleMembers: number,
  rank: number,
  previousRank: number,
): ClubStanding {
  return { clubId, seasonReturn, roundReturn, score, riskAdjusted, drawdown, diversification, consistency, relative, eligibleMembers, rank, previousRank };
}

function uniStanding(
  universityId: string,
  seasonReturn: number,
  roundReturn: number,
  score: number,
  riskAdjusted: number | null,
  drawdown: number | null,
  diversification: number,
  consistency: number | null,
  relative: number,
  eligibleInvestors: number,
  rank: number,
  previousRank: number,
): UniversityStanding {
  return { universityId, seasonReturn, roundReturn, score, riskAdjusted, drawdown, diversification, consistency, relative, eligibleInvestors, rank, previousRank };
}

function buildSeries(start: number, daily: number[], startDate: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let equity = start;
  let benchmark = start;
  const date = new Date(`${startDate}T00:00:00.000Z`);
  points.push({ date: date.toISOString().slice(0, 10), equity: round(equity), benchmark: round(benchmark) });
  daily.forEach((move, index) => {
    date.setUTCDate(date.getUTCDate() + 1);
    equity *= 1 + move;
    const benchMove = index < benchmarkMoves.length ? benchmarkMoves[index] : move * 0.7;
    benchmark *= 1 + benchMove;
    points.push({ date: date.toISOString().slice(0, 10), equity: round(equity), benchmark: round(benchmark) });
  });
  return points;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export const sampleHistoryNote =
  "Prior-year boards are archived sample records. Opening Fall 2025 or Spring 2026 shows champions and does not invent a second live book.";
