const PROTECTED_PREFIXES = ["/portfolio", "/onboarding", "/account", "/students"];
const GUEST_ONLY = ["/login", "/signup"];

export type RouteDecision = { kind: "next" } | { kind: "redirect"; to: string };

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/" || PROTECTED_PREFIXES.some((prefix) => matches(pathname, prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.some((prefix) => matches(pathname, prefix));
}

export function routeDecision(pathname: string, search: string, signedIn: boolean): RouteDecision {
  if (!signedIn && isProtectedPath(pathname)) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return { kind: "redirect", to: `/login${next}` };
  }
  if (signedIn && isGuestOnlyPath(pathname)) {
    const next = new URLSearchParams(search).get("next");
    return { kind: "redirect", to: safeNext(next) };
  }
  return { kind: "next" };
}

// Only same-origin paths are accepted, so a crafted ?next= cannot send a student off-site.
export function isSameSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/.test(value);
}

export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!isSameSitePath(trimmed)) return "/";
  const path = trimmed.split(/[?#]/)[0];
  if (isGuestOnlyPath(path)) return "/";
  return trimmed;
}
