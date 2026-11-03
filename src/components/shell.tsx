"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { countdown } from "@/lib/format";
import { currentRound, demoInvestor, rounds, seasonMeta, universityById } from "@/lib/sample-data";
import { usePortfolio } from "@/lib/portfolio-state";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/markets", label: "Markets" },
  { href: "/competition", label: "Competition" },
  { href: "/research", label: "Research" },
  { href: "/professor", label: "AI Professor" },
  { href: "/clubs", label: "Clubs" },
  { href: "/universities", label: "Universities" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const investor = demoInvestor();
  const university = universityById(investor.universityId);
  const round = currentRound();
  const { reset } = usePortfolio();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-white lg:flex lg:flex-col">
        <Brand />
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {links.map((link) => (
            <NavItem key={link.href} {...link} active={isActive(pathname, link.href)} />
          ))}
        </nav>
        <div className="border-t border-line px-4 py-4 text-xs leading-5 text-muted">
          Sample session
          <div className="mt-1 text-sm text-forest">{investor.name}</div>
          {university?.shortName} · Class of {investor.classYear}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-[#f7faf5]/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <div className="flex items-center gap-3">
              <button className="btn secondary lg:hidden" type="button" onClick={() => setOpen(true)} aria-label="Open navigation">
                Menu
              </button>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{seasonMeta.name} · {round.name}</div>
                <div className="text-sm text-forest">{countdown(round.end)} · closes Nov 13</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link className="btn secondary" href={`/investors/${investor.id}`}>Profile</Link>
              <button className="btn secondary" type="button" onClick={reset}>Reset demo</button>
            </div>
          </div>
          <div className="border-t border-pale bg-mint px-4 py-2 text-xs text-forest lg:px-8">
            Sample data only. Quotes, news, standings, and professor replies are not live market, news, or model integrations.
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 lg:px-8">{children}</main>
      </div>
      {open ? (
        <div className="fixed inset-0 z-30 bg-[#10261c]/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[260px] bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <Brand compact />
              <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <NavItem key={link.href} {...link} active={isActive(pathname, link.href)} onClick={() => setOpen(false)} />
              ))}
            </nav>
            <p className="mt-6 text-xs text-muted">{rounds.filter((item) => item.status === "final").length} finalized sample rounds · 1 provisional</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={compact ? "" : "border-b border-line px-5 py-5"}>
      <div className="serif text-[28px] leading-none text-forest">VestEd</div>
      <div className="mt-1 text-xs text-muted">Collegiate investment competition</div>
    </Link>
  );
}

function NavItem({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link className="nav-link" href={href} data-active={active} onClick={onClick}>
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
