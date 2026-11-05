import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { publishProvisional } from "@/lib/standings/store";
import { loadCurrentRound, roundCloseLabel } from "@/lib/season/current-round";
import { admin, createStudent, deleteUsers, signIn, type Student } from "./support/stack";

// Provisional versions are published into the open local season through the same server path the
// jobs use, then deleted. Finalized rounds are never touched.
const client = admin();
const created: string[] = [];
const publishedVersions: string[] = [];
const students: Record<"lead" | "middle" | "trail", Student> = {} as never;
let seasonId = "";

async function versionIds(): Promise<Set<string>> {
  const { data, error } = await client.from("standings_versions").select("id").eq("season_id", seasonId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.id));
}

test.beforeAll(async () => {
  const now = new Date();
  const { data: season, error } = await client.from("seasons").select("id").lte("starts_at", now.toISOString()).gt("ends_at", now.toISOString()).single();
  if (error || !season) throw new Error("No open local season to rank");
  seasonId = season.id;

  const equities = { lead: "103000.00", middle: "101000.00", trail: "99000.00" } as const;
  for (const key of ["lead", "middle", "trail"] as const) {
    const student = await createStudent(client, `rank-${key}`, created);
    students[key] = student;
    const registered = await client.rpc("ledger_register", { p_student: student.id, p_season: seasonId, p_at: new Date(now.getTime() - 3 * 3_600_000).toISOString() });
    if (registered.error) throw registered.error;
    const registration = registered.data as unknown as string;
    for (const [hoursAgo, equity] of [[2, "100000.00"], [1, equities[key]]] as const) {
      const recorded = await client.rpc("standings_record_valuation", {
        p_registration: registration,
        p_valued_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
        p_status: "valued",
        p_equity: equity,
        p_missing: [],
      });
      if (recorded.error) throw recorded.error;
    }
  }

  const before = await versionIds();
  await publishProvisional(client, seasonId, now);
  for (const id of await versionIds()) if (!before.has(id)) publishedVersions.push(id);
  expect(publishedVersions.length).toBeGreaterThan(0);
});

test.afterAll(async () => {
  if (publishedVersions.length) await client.from("standings_versions").delete().in("id", publishedVersions);
  await deleteUsers(client, created);
});

async function rankOf(row: Locator): Promise<number> {
  return Number((await row.getByRole("cell").first().innerText()).trim().split(/\s/)[0]);
}

test("server ranks stay stable through search, sort, and reload, and the shell shows the server round", async ({ page }) => {
  await signIn(page, students.lead);

  const round = await loadCurrentRound(client);
  expect(round, "the open season has a current round").not.toBeNull();
  const shellRound = page.getByTestId("shell-round");
  await expect(shellRound).toHaveText(`${round!.roundName} · ${roundCloseLabel(round!)}`);
  await expect(shellRound).not.toContainText("Nov 13");

  await page.goto("/competition");
  await expect(page.getByRole("heading", { name: "Standings", level: 1 })).toBeVisible();
  await expect(page.getByText("Sample standings")).toHaveCount(0);
  const table = page.getByRole("table");
  const rowFor = (who: Student) => table.getByRole("row").filter({ hasText: who.displayName });
  await expect(rowFor(students.trail)).toBeVisible();
  await expect(page.getByText("Provisional", { exact: true }).first()).toBeVisible();
  await expect(rowFor(students.lead)).toContainText("You");

  const ranks = {
    lead: await rankOf(rowFor(students.lead)),
    middle: await rankOf(rowFor(students.middle)),
    trail: await rankOf(rowFor(students.trail)),
  };
  expect(ranks.lead).toBeLessThan(ranks.middle);
  expect(ranks.middle).toBeLessThan(ranks.trail);

  const response = await page.request.get("/api/standings");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { windows: Record<string, { boards: { individual: Array<{ entrantId: string; rank: number | null }> } }> };
  const server = payload.windows.season.boards.individual;
  for (const key of ["lead", "middle", "trail"] as const) {
    expect(server.find((row) => row.entrantId === students[key].id)?.rank, `${key} rank matches the server`).toBe(ranks[key]);
  }

  await page.getByRole("searchbox").fill(students.middle.displayName);
  await expect(table.getByRole("row")).toHaveCount(2);
  expect(await rankOf(rowFor(students.middle))).toBe(ranks.middle);
  await page.getByRole("searchbox").fill("");

  await page.getByLabel("Sort by").selectOption("drawdown");
  expect(await rankOf(rowFor(students.trail))).toBe(ranks.trail);
  expect(await rankOf(rowFor(students.lead))).toBe(ranks.lead);

  await page.reload();
  await expect(rowFor(students.lead)).toBeVisible();
  expect(await rankOf(rowFor(students.lead))).toBe(ranks.lead);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => violation.id)).toEqual([]);

  const forged = await page.request.post("/api/standings", { data: { entrantId: students.trail.id, rank: 1 } });
  expect(forged.status()).toBe(405);
});
