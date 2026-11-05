import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, deleteUsers, runId, userIdByEmail } from "./support/stack";

const client = admin();
const email = `e2e-signup-${runId}@example.com`;

test.afterAll(async () => {
  const id = await userIdByEmail(client, email);
  if (id) await deleteUsers(client, [id]);
});

test("a new student registers, finishes setup without a club, and signs out", async ({ page }) => {
  const displayName = `Signup ${runId}`;
  await page.goto("/signup");
  await page.getByLabel("Display name", { exact: true }).fill(displayName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(`pw-${randomUUID()}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/onboarding");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "University verification" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Join a club, or not" })).toBeVisible();
  await page.getByRole("button", { name: "Skip clubs for now" }).click();
  await expect(page.getByRole("heading", { name: "Review and finish" })).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back, Signup.");
  const standing = page.getByTestId("account-standing");
  await expect(standing).toContainText("Individual account");
  await expect(standing).toContainText("No club needed to compete.");

  const id = await userIdByEmail(client, email);
  expect(id, "signup created an Auth user").not.toBeNull();
  const { data: profile } = await client.from("profiles").select("display_name, onboarded_at, holdings_public").eq("id", id!).single();
  expect(profile).toMatchObject({ display_name: displayName, holdings_public: false });
  expect(profile?.onboarded_at).not.toBeNull();
  const { count } = await client.from("club_memberships").select("club_id", { count: "exact", head: true }).eq("student_id", id!);
  expect(count, "no club is required").toBe(0);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});
