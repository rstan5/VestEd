"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countdown, shortDate } from "@/lib/format";
import { currentRound, demoInvestor, rounds, seasonMeta, universityById } from "@/lib/sample-data";
import { usePortfolio } from "@/lib/portfolio-state";

// Only these routes use the new student shell. Every other route keeps the
// prototype chrome until library/design-gate.md records visual approval.
const REDESIGNED_ROUTES = new Set(["/", "/portfolio", "/competition"]);

export const primaryNav = [
  { href: "/", label: "Home", match: ["/"], icon: "home" },
  { href: "/portfolio", label: "Portfolio", match: ["/portfolio"], icon: "ledger" },
  { href: "/markets", label: "Markets", match: ["/markets", "/research"], icon: "markets" },
  { href: "/competition", label: "Compete", match: ["/competition"], icon: "compete" },
  { href: "/clubs", label: "Campus", match: ["/clubs", "/universities"], icon: "campus" },
] as const;

type AccountLink = { label: string; href: string | null; note?: string };

// Destinations without a route yet stay visible and say so, rather than linking to a 404.
export const accountLinks = (investorId: string): AccountLink[] => [
  { label: "Profile", href: `/investors/${investorId}`, note: "Sample profile" },
  { label: "Privacy", href: null, note: "Arrives with accounts" },
  { label: "University verification", href: null, note: "Arrives with accounts" },
  { label: "Settings", href: null, note: "Arrives with accounts" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (REDESIGNED_ROUTES.has(pathname)) return <StudentShell pathname={pathname}>{children}</StudentShell>;
  return <LegacyShell pathname={pathname}>{children}</LegacyShell>;
}

function StudentShell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const round = currentRound();

  return (
    <div className="student min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-rule bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-5 md:px-8">
          <Link href="/" className="serif text-[26px] leading-none text-forest" aria-label="VestEd home">
            VestEd
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
            {primaryNav.map((item) => (
              <Link key={item.href} href={item.href} className="v-nav" data-active={isActiveIn(pathname, item.match)} aria-current={isActiveIn(pathname, item.match) ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden lg:inline-flex lg:items-center lg:gap-2">
              <span className="v-tag" title={`${seasonMeta.name}, ${round.name}. ${countdown(round.end, new Date(seasonMeta.asOf))} on the sample clock.`}>
                {round.name} · closes {shortDate(round.end)}
              </span>
              <Link href="/professor" className="v-nav">Professor</Link>
            </span>
            <AccountMenu />
          </div>
        </div>
        <p className="border-t border-rule bg-wash px-5 py-1.5 text-center text-[12px] text-quiet md:px-8">
          <span className="sm:hidden">Sample build. Nothing shown is live.</span>
          <span className="hidden sm:inline">Sample build. Quotes, standings, and Professor replies are not live.</span>
        </p>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1180px] px-5 pb-32 pt-8 md:px-8 md:pb-16 md:pt-12">{children}</main>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        <ul className="grid grid-cols-5">
          {primaryNav.map((item) => {
            const active = isActiveIn(pathname, item.match);
            return (
              <li key={item.href}>
                <Link href={item.href} className="v-tabbar" data-active={active} aria-current={active ? "page" : undefined}>
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { reset } = usePortfolio();
  const investor = demoInvestor();
  const university = universityById(investor.universityId);
  const initials = investor.name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        className="flex items-center gap-2 rounded-full border border-rule bg-paper py-1 pl-1 pr-3 text-sm text-forest hover:border-sage"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-mint text-[12px] font-medium text-forest" aria-hidden="true">{initials}</span>
        <span className="hidden sm:inline">{investor.name.split(" ")[0]}</span>
        <span className="sr-only">Account menu</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-quiet" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {open ? (
        <div id="account-menu" className="absolute right-0 top-[calc(100%+8px)] w-[320px] max-w-[calc(100vw-40px)] rounded-2xl border border-rule bg-paper p-2 shadow-[0_18px_40px_rgba(16,59,43,0.08)]">
          <div className="px-3 pb-3 pt-2">
            <div className="text-sm font-medium text-forest">{investor.name}</div>
            <div className="text-xs text-quiet">Sample session · {university?.shortName ?? "University unavailable"} · Class of {investor.classYear}</div>
          </div>
          <nav aria-label="Account">
            <ul className="border-t border-rule pt-1">
              {accountLinks(investor.id).map((item) => (
                <li key={item.label}>
                  {item.href ? (
                    <Link href={item.href} className="v-menu-item" onClick={() => setOpen(false)}>
                      <span>{item.label}</span>
                      {item.note ? <span className="text-[11px] text-quiet">{item.note}</span> : null}
                    </Link>
                  ) : (
                    <span className="v-menu-item" aria-disabled="true">
                      <span className="text-ink/70">{item.label}</span>
                      <span className="text-[11px] text-quiet">{item.note}</span>
                    </span>
                  )}
                </li>
              ))}
              <li className="lg:hidden">
                <Link href="/professor" className="v-menu-item" onClick={() => setOpen(false)}>
                  <span>Professor</span>
                  <span className="text-[11px] text-quiet">Demonstration</span>
                </Link>
              </li>
            </ul>
            <ul className="mt-1 border-t border-rule pt-1">
              <li>
                <button type="button" className="v-menu-item w-full text-left" onClick={() => { reset(); setOpen(false); }}>
                  <span>Reset sample book</span>
                </button>
              </li>
              <li>
                <span className="v-menu-item" aria-disabled="true">
                  <span className="text-ink/70">Sign out</span>
                  <span className="text-[11px] text-quiet">No account session yet</span>
                </span>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function NavIcon({ name }: { name: (typeof primaryNav)[number]["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {name === "home" ? <path {...common} d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /> : null}
      {name === "ledger" ? <path {...common} d="M5 5h14v14H5zM5 10h14M5 14.5h14M10 10v9" /> : null}
      {name === "markets" ? <path {...common} d="M4 18 9.5 12l3.5 3.5L20 8M15 8h5v5" /> : null}
      {name === "compete" ? <path {...common} d="M5 19V13M12 19V6M19 19v-9" /> : null}
      {name === "campus" ? <path {...common} d="M3 9.5 12 5l9 4.5M5 10.5V18M9.5 10.5V18M14.5 10.5V18M19 10.5V18M3.5 19.5h17" /> : null}
    </svg>
  );
}

function isActiveIn(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

const legacyLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/markets", label: "Markets" },
  { href: "/competition", label: "Competition" },
  { href: "/research", label: "Research" },
  { href: "/professor", label: "AI Professor" },
  { href: "/clubs", label: "Clubs" },
  { href: "/universities", label: "Universities" },
];

function LegacyShell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const investor = demoInvestor();
  const university = universityById(investor.universityId);
  const round = currentRound();
  const { reset } = usePortfolio();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-white lg:flex lg:flex-col">
        <LegacyBrand />
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {legacyLinks.map((link) => (
            <LegacyNavItem key={link.href} {...link} active={isLegacyActive(pathname, link.href)} />
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
              <LegacyBrand compact />
              <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
            <nav className="flex flex-col gap-1">
              {legacyLinks.map((link) => (
                <LegacyNavItem key={link.href} {...link} active={isLegacyActive(pathname, link.href)} onClick={() => setOpen(false)} />
              ))}
            </nav>
            <p className="mt-6 text-xs text-muted">{rounds.filter((item) => item.status === "final").length} finalized sample rounds · 1 provisional</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LegacyBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={compact ? "" : "border-b border-line px-5 py-5"}>
      <div className="serif text-[28px] leading-none text-forest">VestEd</div>
      <div className="mt-1 text-xs text-muted">Collegiate investment competition</div>
    </Link>
  );
}

function LegacyNavItem({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link className="nav-link" href={href} data-active={active} onClick={onClick}>
      {label}
    </Link>
  );
}

function isLegacyActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
