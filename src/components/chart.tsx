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

export function QuietLine({ points, label, height = 160 }: { points: Array<{ label: string; value: number }>; label: string; height?: number }) {
  if (points.length < 2) return null;
  const width = 720;
  const top = 12;
  const bottom = height - 8;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => (index / (points.length - 1)) * width;
  const y = (value: number) => top + (1 - (value - min) / span) * (bottom - top);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-[140px] w-full md:h-[160px]" role="img" aria-label={label}>
      <defs>
        <linearGradient id="quiet-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d8ebd5" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#d8ebd5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={width} y1={bottom} y2={bottom} stroke="#e4eae2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={area} fill="url(#quiet-wash)" />
      <path d={line} fill="none" stroke="#247448" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const allocationTones = ["#174f36", "#247448", "#5b9568", "#a6c5a0", "#c9dfc5", "#e1eedf"];

export function AllocationBar({ items, cash }: { items: Array<{ label: string; weight: number }>; cash: number }) {
  const parts = [...items.map((item, index) => ({ ...item, color: allocationTones[Math.min(index, allocationTones.length - 1)] })), { label: "Cash", weight: cash, color: "#ece9df" }].filter((part) => part.weight > 0);
  return (
    <figure>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#f1f4ef]" role="img" aria-label={`Allocation: ${parts.map((part) => `${part.label} ${Math.round(part.weight * 100)}%`).join(", ")}`}>
        {parts.map((part) => (
          <span key={part.label} className="h-full" style={{ width: `${part.weight * 100}%`, background: part.color }} />
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-quiet">
        {parts.map((part) => (
          <span key={part.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: part.color }} aria-hidden="true" />
            {part.label} <span className="mono text-forest">{Math.round(part.weight * 100)}%</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
