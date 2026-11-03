"use client";

type Point = { label: string; value: number; benchmark?: number };

export function LineChart({ points, height = 220 }: { points: Point[]; height?: number }) {
  if (points.length < 2) {
    return <div className="card grid h-[220px] place-items-center text-sm text-muted">Not enough points to draw a chart.</div>;
  }
  const width = 720;
  const pad = 16;
  const values = points.flatMap((point) => [point.value, point.benchmark ?? point.value]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - pad * 2);
  const path = (key: "value" | "benchmark") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point[key] ?? point.value).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Portfolio and benchmark chart">
      {[0, 0.5, 1].map((step) => (
        <line key={step} x1={pad} x2={width - pad} y1={pad + step * (height - pad * 2)} y2={pad + step * (height - pad * 2)} stroke="#d5e4d4" strokeWidth="1" />
      ))}
      <path d={path("benchmark")} fill="none" stroke="#a6c5a0" strokeWidth="2" />
      <path d={path("value")} fill="none" stroke="#247448" strokeWidth="2.4" />
    </svg>
  );
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 84;
      const y = 22 - ((value - min) / span) * 18;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 84 24" className="h-6 w-20" aria-hidden="true">
      <path d={d} fill="none" stroke="#247448" strokeWidth="1.6" />
    </svg>
  );
}

export function Bars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 0.01);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[110px_1fr_48px] items-center gap-2 text-sm">
          <span className="truncate text-forest">{item.label}</span>
          <span className="h-2 rounded-full bg-pale">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="num text-muted">{Math.round(item.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
