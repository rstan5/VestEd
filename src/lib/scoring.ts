import {
  CASH_DRAG_THRESHOLD,
  MIN_CONSISTENCY_ROUNDS,
  MIN_DRAWDOWN_OBS,
  MIN_RISK_OBS,
  POSITION_FLOOR,
  type PerformanceSnapshot,
  type ScoreComponent,
} from "./domain";

export function periodReturn(start: number, end: number): number {
  if (start <= 0) return 0;
  return end / start - 1;
}

export function timeWeightedReturn(startValue: number, endValue: number, externalFlows: number[] = []): number {
  if (externalFlows.length === 0) return periodReturn(startValue, endValue);
  const base = startValue + externalFlows.reduce((sum, flow) => sum + flow, 0);
  return periodReturn(Math.max(base, 0.01), endValue);
}

export function maxDrawdown(values: number[]): number | null {
  if (values.length < MIN_DRAWDOWN_OBS) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.min(worst, value / peak - 1);
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

export function volatility(values: number[]): number | null {
  const returns = dailyReturns(values);
  if (returns.length < MIN_RISK_OBS - 1) return null;
  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function riskAdjusted(values: number[], benchmark: number[]): number | null {
  if (values.length < MIN_RISK_OBS || benchmark.length < MIN_RISK_OBS) return null;
  const asset = dailyReturns(values);
  const bench = dailyReturns(benchmark.slice(0, values.length));
  const n = Math.min(asset.length, bench.length);
  if (n < MIN_RISK_OBS - 1) return null;
  const excess = asset.slice(0, n).map((item, index) => item - bench[index]);
  const mean = excess.reduce((sum, item) => sum + item, 0) / excess.length;
  const variance = excess.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (excess.length - 1);
  const dailyVol = Math.sqrt(variance);
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

export function consistencyScore(roundExcessReturns: Array<number | null>): number | null {
  const completed = roundExcessReturns.filter((item): item is number => item !== null);
  if (completed.length < MIN_CONSISTENCY_ROUNDS) return null;
  const positive = completed.filter((item) => item > 0).length;
  return (positive / completed.length) * Math.min(completed.length / 4, 1);
}

export function percentile(value: number, population: number[], higherIsBetter = true): number {
  if (population.length === 0) return 0.5;
  const beaten = population.filter((item) => (higherIsBetter ? value >= item : value <= item)).length;
  return beaten / population.length;
}

export function compositeScore(input: {
  returnPct: number;
  returnField: number[];
  riskAdjusted: number | null;
  riskField: number[];
  drawdown: number | null;
  drawdownField: number[];
  diversification: number;
  consistency: number | null;
  relative: number | null;
  relativeField: number[];
}): { score: number | null; label: PerformanceSnapshot["scoreLabel"]; components: ScoreComponent[] } {
  const candidates: ScoreComponent[] = [
    {
      key: "return",
      label: "Return percentile",
      value: percentile(input.returnPct, input.returnField, true),
      display: "",
      availability: "official",
      weight: 0.3,
      note: "Percentile of time-weighted return inside this board.",
    },
    {
      key: "risk",
      label: "Risk-adjusted percentile",
      value: input.riskAdjusted === null ? null : percentile(input.riskAdjusted, input.riskField, true),
      display: "",
      availability: input.riskAdjusted === null ? "insufficient" : "official",
      weight: 0.2,
      note: "Requires 20 daily observations. Not a Sharpe ratio.",
    },
    {
      key: "drawdown",
      label: "Drawdown percentile",
      value: input.drawdown === null ? null : percentile(input.drawdown, input.drawdownField, false),
      display: "",
      availability: input.drawdown === null ? "insufficient" : "official",
      weight: 0.15,
      note: "Lower drawdown ranks higher. Requires 10 daily observations.",
    },
    {
      key: "diversification",
      label: "Diversification",
      value: input.diversification,
      display: "",
      availability: "official",
      weight: 0.15,
      note: "Holdings under 2% do not count. Cash above 20% reduces the score.",
    },
    {
      key: "consistency",
      label: "Consistency",
      value: input.consistency,
      display: "",
      availability: input.consistency === null ? "insufficient" : "official",
      weight: 0.1,
      note: "Needs two completed rounds of excess return versus the benchmark.",
    },
    {
      key: "relative",
      label: "Relative performance",
      value: input.relative === null ? null : percentile(input.relative, input.relativeField, true),
      display: "",
      availability: input.relative === null ? "insufficient" : "official",
      weight: 0.1,
      note: "Percentile of return minus the sample S&P 500 return.",
    },
  ];

  const official = candidates.filter((item) => item.availability === "official" && item.value !== null);
  const weightSum = official.reduce((sum, item) => sum + item.weight, 0);
  const components = candidates.map((item) => ({
    ...item,
    display: item.value === null ? "Insufficient data" : `${Math.round(item.value * 100)}`,
  }));

  if (official.length < 3 || weightSum === 0) {
    return { score: null, label: "Unavailable", components };
  }

  const score = official.reduce((sum, item) => sum + (item.value as number) * (item.weight / weightSum), 0) * 100;
  return {
    score: Math.round(score * 10) / 10,
    label: official.length === candidates.length ? "Official" : "Partial",
    components,
  };
}

export function buildSnapshot(input: {
  values: number[];
  benchmark: number[];
  holdings: HoldingWeight[];
  cashWeight: number;
  roundExcess: Array<number | null>;
  field?: {
    returns: number[];
    risk: number[];
    drawdown: number[];
    relative: number[];
  };
}): PerformanceSnapshot {
  const returnPct = input.values.length >= 2 ? periodReturn(input.values[0], input.values[input.values.length - 1]) : 0;
  const benchmarkReturn =
    input.benchmark.length >= 2 ? periodReturn(input.benchmark[0], input.benchmark[input.benchmark.length - 1]) : null;
  const risk = riskAdjusted(input.values, input.benchmark);
  const drawdown = maxDrawdown(input.values);
  const diversification = diversificationScore(input.holdings, input.cashWeight);
  const consistency = consistencyScore(input.roundExcess);
  const relative = benchmarkReturn === null ? null : returnPct - benchmarkReturn;
  const field = input.field ?? {
    returns: [returnPct],
    risk: risk === null ? [] : [risk],
    drawdown: drawdown === null ? [] : [drawdown],
    relative: relative === null ? [] : [relative],
  };
  const composite = compositeScore({
    returnPct,
    returnField: field.returns,
    riskAdjusted: risk,
    riskField: field.risk,
    drawdown,
    drawdownField: field.drawdown,
    diversification,
    consistency,
    relative,
    relativeField: field.relative,
  });

  return {
    returnPct,
    riskAdjusted: risk,
    drawdown,
    diversification,
    volatility: volatility(input.values),
    consistency,
    relative,
    score: composite.score,
    scoreLabel: composite.label,
    components: composite.components,
    observations: Math.max(0, input.values.length - 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
