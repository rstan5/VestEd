import { expect, test } from "@playwright/test";
import { admin, createStudent, deleteUsers, signIn, type Student } from "./support/stack";

const client = admin();
const created: string[] = [];
let student: Student;

test.beforeAll(async () => {
  student = await createStudent(client, "order", created);
});

test.afterAll(async () => {
  await deleteUsers(client, created);
});

test("a student queues a simulated buy that waits for a later quote, then cancels it", async ({ page }) => {
  await signIn(page, student);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio", level: 1 })).toBeVisible();
  await expect(page.getByText("No holdings yet")).toBeVisible();

  await page.getByRole("button", { name: "Trade", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "Trade" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Sample quotes")).toBeVisible();
  await sheet.getByLabel("Symbol").selectOption("MSFT");
  await sheet.getByLabel("Shares").fill("2");
  await sheet.getByRole("button", { name: "Review order" }).click();
  await expect(sheet.getByText("Buy 2 MSFT")).toBeVisible();
  await sheet.getByRole("button", { name: "Confirm buy" }).click();

  const receipt = sheet.getByRole("status");
  await expect(receipt).toContainText("Accepted");
  await expect(receipt).toContainText("Queued until");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const { data: orders } = await client.from("orders").select("id, status, quantity, instrument_id, accepted_at, eligible_at").eq("student_id", student.id);
  expect(orders).toHaveLength(1);
  const order = orders![0];
  expect(order).toMatchObject({ status: "accepted", quantity: 2, instrument_id: "MSFT" });
  expect(Date.parse(order.eligible_at) - Date.parse(order.accepted_at)).toBeGreaterThanOrEqual(15 * 60 * 1000);
  const { count: fills } = await client.from("executions").select("id", { count: "exact", head: true }).eq("student_id", student.id);
  expect(fills, "nothing fills before the 15-minute wait").toBe(0);

  await page.reload();
  await page.getByRole("tab", { name: /Orders/ }).click();
  const open = page.getByRole("region", { name: "Open orders" });
  const row = open.getByRole("row", { name: /2 MSFT/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("No open orders")).toBeVisible();
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByRole("row", { name: /2 MSFT/ })).toContainText("Cancelled");
  const { data: after } = await client.from("orders").select("status").eq("id", order.id).single();
  expect(after?.status).toBe("cancelled");
  const { data: reserves } = await client.from("order_reservations").select("release_reason").eq("order_id", order.id);
  expect(reserves).toEqual([{ release_reason: "cancelled" }]);
});
