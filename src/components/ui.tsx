import Link from "next/link";
import { classNames, tone } from "@/lib/format";

export function Pill({ children, tone: kind = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "dark" }) {
  return <span className={classNames("pill", kind === "warn" && "warn", kind === "dark" && "dark")}>{children}</span>;
}

export function Delta({ value, text }: { value: number | null; text: string }) {
  return <span className={tone(value)}>{text}</span>;
}

export function Metric({ label, value, detail, hint }: { label: string; value: string; detail?: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="serif mt-1 text-[28px] leading-none text-forest">{value}</div>
      {detail ? <div className="mt-2 text-sm">{detail}</div> : null}
      {hint ? <p className="mt-2 text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow ? <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{eyebrow}</div> : null}
        <h2 className="serif text-2xl text-forest">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card px-5 py-10 text-center">
      <h3 className="serif text-xl text-forest">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function Movement({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-muted">New</span>;
  const delta = previous - current;
  if (delta === 0) return <span className="text-muted">—</span>;
  return <span className={delta > 0 ? "up" : "down"}>{delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`}</span>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="text-primary underline-offset-2 hover:underline" href={href}>{children}</Link>;
}
