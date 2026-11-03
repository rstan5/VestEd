import {
  CASH_DRAG_THRESHOLD,
  MIN_CONSISTENCY_ROUNDS,
  MIN_DRAWDOWN_OBS,
  MIN_RISK_OBS,
  POSITION_FLOOR,
  type ComponentAvailability,
  type MetricKey,
  type PerformanceSnapshot,
  type ScoreComponent,
  type ScoreComponentKey,
} from "./domain";

export const SCORE_WEIGHTS: Record<ScoreComponentKey, number> = {
  return: 0.3,
  risk: 0.2,
  drawdown: 0.15,
  diversification: 0.15,
  consistency: 0.1,
  relative: 0.1,
};

export const MIN_OFFICIAL_COMPONENTS = 3;

export type Direction = "higher" | "lower";

export const METRIC_DIRECTION: Record<MetricKey, Direction> = {
  return: "higher",
  score: "higher",
  riskAdjusted: "higher",
  diversification: "higher",
  drawdown: "lower",
  consistency: "higher",
  relative: "higher",
};

export function periodReturn(start: number, end: number): number {
  if (start <= 0) return 0;
  return end / start - 1;
}

/** Only `funding` is external capital. Trades and dividends move value inside the book. */
export type CashFlowKind = "funding" | "trade" | "dividend";
export type CashFlow = { kind: CashFlowKind; amount: number };

/** `equity` is measured after the listed flows have settled. */
export type ValuationPoint = { equity: number; flows?: CashFlow[] };

export function externalFlow(flows: CashFlow[] = []): number {
  return flows.reduce((sum, flow) => (flow.kind === "funding" ? sum + flow.amount : sum), 0);
}

function subperiodGrowth(points: ValuationPoint[]): number[] | null {
  const growth: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1].equity;
    if (start <= 0) return null;
    growth.push((points[i].equity - externalFlow(points[i].flows)) / start);
  }
  return growth;
}

export function timeWeightedReturn(points: ValuationPoint[]): number | null {
  if (points.length < 2) return null;
  const growth = subperiodGrowth(points);
  if (!growth) return null;
  return growth.reduce((product, item) => product * item, 1) - 1;
}

/** Flow-adjusted value path that starts at the first equity, so deposits do not look like gains. */
export function growthIndex(points: ValuationPoint[]): number[] {
  if (points.length === 0) return [];
  const growth = subperiodGrowth(points);
  if (!growth) return [];
  const index = [points[0].equity];
  for (const item of growth) index.push(index[index.length - 1] * item);
  return index;
}

export function returnIntervals(values: number[]): number {
  return Math.max(0, values.length - 1);
}

/** Largest peak-to-trough loss as a positive fraction. */
export function maxDrawdown(values: number[]): number | null {
  if (returnIntervals(values) < MIN_DRAWDOWN_OBS) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.max(worst, 1 - value / peak);
  }
  return worst;
}

export function dailyReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > 0) returns.push(values[i] / values[i - 1] - 1);
  }
  return returns;
}

function sampleStdDev(items: number[]): number {
  const mean = items.reduce((sum, item) => sum + item, 0) / items.length;
  const variance = items.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (items.length - 1);
  return Math.sqrt(variance);
}

export function volatility(values: number[]): number | null {
  const returns = dailyReturns(values);
  if (returns.length < MIN_RISK_OBS) return null;
  return sampleStdDev(returns) * Math.sqrt(252);
}

/** Competition statistic: annualized mean excess over the benchmark divided by excess-return volatility. Not a Sharpe ratio. */
export function riskAdjusted(values: number[], benchmark: number[]): number | null {
  const asset = dailyReturns(values);
  const bench = dailyReturns(benchmark.slice(0, values.length));
  const n = Math.min(asset.length, bench.length);
  if (n < MIN_RISK_OBS) return null;
  const excess = asset.slice(0, n).map((item, index) => item - bench[index]);
  const mean = excess.reduce((sum, item) => sum + item, 0) / excess.length;
  const dailyVol = sampleStdDev(excess);
  if (dailyVol === 0) return null;
  return (mean / dailyVol) * Math.sqrt(252);
}

export type HoldingWeight = {
  weight: number;
  sector: string;
};

export function diversificationScore(holdings: HoldingWeight[], cashWeight: number): number {
  const qualifying = holdings.filter((holding) => holding.weight + 1e-9 >= POSITION_FLOOR);
  if (qualifying.length === 0) return 0;
  const deployed = qualifying.reduce((sum, holding) => sum + holding.weight, 0);
  const herfindahl = qualifying.reduce((sum, holding) => {
    const normalized = holding.weight / deployed;
    return sum + normalized ** 2;
  }, 0);
  const effectiveN = herfindahl > 0 ? 1 / herfindahl : 1;
  const breadth = Math.min(effectiveN / 8, 1);
  const sectors = new Set(qualifying.map((holding) => holding.sector)).size;
  const sectorScore = Math.min(sectors / 5, 1);
  const cashDrag = Math.max(0, cashWeight - CASH_DRAG_THRESHOLD) / 0.8;
  const raw = breadth * 0.62 + sectorScore * 0.38 - cashDrag * 0.25;
  return clamp(raw, 0, 1);
}

export type RoundResult = { status: "final" | "provisional"; excessReturn: number | null };

export function consistencyScore(rounds: RoundResult[]): number | null {
  const completed = rounds
    .filter((round) => round.status === "final" && round.excessReturn !== null)
    .map((round) => round.excessReturn as number);
  if (completed.length < MIN_CONSISTENCY_ROUNDS) return null;
  const positive = completed.filter((item) => item > 0).length;
  return (positive / completed.length) * Math.min(completed.length / 4, 1);
}

/**
 * Mid-rank percentile of `value` against the other eligible entrants. `others` excludes the subject.
 * With no other entrant there is no field, so no percentile.
 */
export function percentile(value: number, others: Array<number | null>, direction: Direction = "higher"): number | null {
  const field = others.filter((item): item is number => item !== null);
  if (field.length === 0) return null;
  let beaten = 0;
  let tied = 0;
  for (const item of field) {
    if (item === value) tied += 1;
    else if (direction === "higher" ? value > item : value < item) beaten += 1;
  }
  return (beaten + tied / 2) / field.length;
}

/** Percentile for every entrant of one board's eligible field. Missing values stay null and are not in the field. */
export function fieldPercentiles(values: Array<number | null>, direction: Direction = "higher"): Array<number | null> {
  return values.map((value, index) =>
    value === null ? null : percentile(value, values.filter((_, other) => other !== index), direction),
  );
}

/** Orders two metric values best first. Missing values sort last. */
export function compareMetric(left: number | null, right: number | null, direction: Direction): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "higher" ? right - left : left - right;
}

type ComponentSpec = {
  key: ScoreComponentKey;
  label: string;
  note: string;
  value: number | null;
  missing: Exclude<ComponentAvailability, "official">;
};

export function compositeScore(input: {
  returnPct: number | null;
  returnField: Array<number | null>;
  riskAdjusted: number | null;
  riskField: Array<number | null>;
  drawdown: number | null;
  drawdownField: Array<number | null>;
  diversification: number | null;
  consistency: number | null;
  relative: number | null;
  relativeField: Array<number | null>;
  benchmarkLicensed: boolean;
}): { score: number | null; label: PerformanceSnapshot["scoreLabel"]; components: ScoreComponent[]; included: ScoreComponentKey[] } {
  const licensed = input.benchmarkLicensed;
  const ranked = (raw: number | null, field: Array<number | null>, direction: Direction) =>
    raw === null ? null : percentile(raw, field, direction);
  const missingRanked = (raw: number | null) => (raw === null ? "insufficient" : "unavailable") as ComponentSpec["missing"];

  const specs: ComponentSpec[] = [
    {
      key: "return",
      label: "Return percentile",
      note: "Percentile of time-weighted return among the other eligible entrants on this board.",
      value: ranked(input.returnPct, input.returnField, METRIC_DIRECTION.return),
      missing: missingRanked(input.returnPct),
    },
    {
      key: "risk",
      label: "Risk-adjusted percentile",
      note: "Requires 20 return intervals and a licensed benchmark. Not a Sharpe ratio.",
      value: licensed ? ranked(input.riskAdjusted, input.riskField, METRIC_DIRECTION.riskAdjusted) : null,
      missing: licensed ? missingRanked(input.riskAdjusted) : "unavailable",
    },
    {
      key: "drawdown",
      label: "Drawdown percentile",
      note: "Smaller loss ranks higher. Requires 10 return intervals.",
      value: ranked(input.drawdown, input.drawdownField, METRIC_DIRECTION.drawdown),
      missing: missingRanked(input.drawdown),
    },
    {
      key: "diversification",
      label: "Diversification",
      note: "Holdings under 2% do not count. Cash above 20% reduces the score.",
      value: input.diversification,
      missing: "unavailable",
    },
    {
      key: "consistency",
      label: "Consistency",
      note: "Needs two finalized rounds of excess return versus a licensed benchmark.",
      value: licensed ? input.consistency : null,
      missing: licensed ? "insufficient" : "unavailable",
    },
    {
      key: "relative",
      label: "Relative performance",
      note: "Return minus the S&P 500 total return. Unavailable until that series is licensed.",
      value: licensed ? ranked(input.relative, input.relativeField, METRIC_DIRECTION.relative) : null,
      missing: licensed ? missingRanked(input.relative) : "unavailable",
    },
  ];

  const components: ScoreComponent[] = specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    value: spec.value,
    display: spec.value === null ? (spec.missing === "insufficient" ? "Not enough data" : "Unavailable") : `${Math.round(spec.value * 100)}`,
    availability: spec.value === null ? spec.missing : "official",
    weight: SCORE_WEIGHTS[spec.key],
    note: spec.note,
  }));

  const official = components.filter((item) => item.value !== null);
  const included = official.map((item) => item.key);
  const weightSum = official.reduce((sum, item) => sum + item.weight, 0);
  if (official.length === 0 || weightSum === 0) {
    return { score: null, label: "Unavailable", components, included };
  }

  const score = official.reduce((sum, item) => sum + (item.value as number) * (item.weight / weightSum), 0) * 100;
  return {
    score: Math.round(score * 10) / 10,
    label: official.length < MIN_OFFICIAL_COMPONENTS ? "Partial" : "Official",
    components,
    included,
  };
}

/** Only a licensed total-return series may be passed. Sample paths and price indexes are not a benchmark. */
export type LicensedBenchmark = { licensed: true; values: number[] };

export function buildSnapshot(input: {
  points: ValuationPoint[];
  benchmark: LicensedBenchmark | null;
  holdings: HoldingWeight[] | null;
  cashWeight: number;
  rounds: RoundResult[];
  /** Values of the other eligible entrants on the same board. */
  field: {
    returns: Array<number | null>;
    risk: Array<number | null>;
    drawdown: Array<number | null>;
    relative: Array<number | null>;
  };
}): PerformanceSnapshot {
  const index = growthIndex(input.points);
  const benchmark = input.benchmark;
  const returnPct = timeWeightedReturn(input.points);
  const risk = benchmark ? riskAdjusted(index, benchmark.values) : null;
  const drawdown = maxDrawdown(index);
  const diversification = input.holdings ? diversificationScore(input.holdings, input.cashWeight) : null;
  const consistency = benchmark ? consistencyScore(input.rounds) : null;
  const benchmarkReturn =
    benchmark && benchmark.values.length >= 2 ? periodReturn(benchmark.values[0], benchmark.values[benchmark.values.length - 1]) : null;
  const relative = returnPct === null || benchmarkReturn === null ? null : returnPct - benchmarkReturn;
  const composite = compositeScore({
    returnPct,
    returnField: input.field.returns,
    riskAdjusted: risk,
    riskField: input.field.risk,
    drawdown,
    drawdownField: input.field.drawdown,
    diversification,
    consistency,
    relative,
    relativeField: input.field.relative,
    benchmarkLicensed: benchmark !== null,
  });

  return {
    returnPct,
    riskAdjusted: risk,
    drawdown,
    diversification,
    volatility: volatility(index),
    consistency,
    relative,
    score: composite.score,
    scoreLabel: composite.label,
    components: composite.components,
    included: composite.included,
    observations: returnIntervals(index),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
