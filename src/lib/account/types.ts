import type { CampusSummary } from "@/lib/campus/types";

export type Account = {
  id: string;
  email: string;
  displayName: string;
  classYear: number | null;
  concentration: string | null;
  holdingsPublic: boolean;
  onboarded: boolean;
  memberSince: string;
  campus: CampusSummary;
};

export type AccountState =
  | { status: "signed-in"; account: Account }
  | { status: "signed-out" }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  values?: Record<string, string>;
};

export const idleForm: FormState = { status: "idle" };

export function memberSinceLabel(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Student";
}

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] ?? "S").slice(0, 2);
  return letters.toUpperCase();
}
