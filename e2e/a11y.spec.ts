import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, createStudent, deleteUsers, signedInPage, type Student } from "./support/stack";

const client = admin();
const created: string[] = [];
let student: Student;

const routes = [
  { name: "Home", path: "/", ready: (page: Page) => page.getByText("Next step", { exact: true }) },
  { name: "Portfolio", path: "/portfolio", ready: (page: Page) => page.getByRole("tab", { name: /Holdings/ }) },
  { name: "Leaderboard", path: "/competition", ready: (page: Page) => page.getByRole("button", { name: "Students" }) },
] as const;

test.beforeAll(async () => {
  student = await createStudent(client, "a11y", created);
});

test.afterAll(async () => {
  await deleteUsers(client, created);
});

async function open(page: Page, route: (typeof routes)[number]) {
  await page.goto(route.path);
  await expect(route.ready(page).first()).toBeVisible();
  await expect(page.locator("[data-state='loading']")).toHaveCount(0);
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical" || violation.id === "color-contrast")
    .map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")) }));
}

/** Tabs through the page and records every stop, with whether it shows a focus ring. */
async function tabStops(page: Page, count: number) {
  const stops: Array<{ label: string; ring: boolean }> = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return { label: "body", ring: false };
        const style = getComputedStyle(element);
        const ring = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
        const label = (element.getAttribute("aria-label") || element.innerText || element.getAttribute("placeholder") || element.tagName).trim().replace(/\s+/g, " ");
        return { label: `${element.tagName.toLowerCase()}:${label}`, ring };
      }),
    );
  }
  return stops;
}

for (const route of routes) {
  test(`${route.name} has no serious axe, contrast, or keyboard violations`, async ({ browser }) => {
    const page = await signedInPage(browser, student);
    await open(page, route);
    expect(await seriousViolations(page)).toEqual([]);
    await page.context().close();
  });

  test(`${route.name} is reachable by keyboard with a visible focus ring`, async ({ browser }) => {
    const page = await signedInPage(browser, student);
    await open(page, route);
    const stops = await tabStops(page, 14);
    expect(stops[0].label).toBe("a:Skip to content");
    expect(stops.filter((stop) => !stop.ring), "every tab stop shows focus").toEqual([]);
    expect(stops.some((stop) => stop.label.startsWith("a:Portfolio"))).toBe(true);
    await page.context().close();
  });

  test(`${route.name} holds still when reduced motion is requested`, async ({ browser }) => {
    const page = await signedInPage(browser, student, { reducedMotion: "reduce" });
    await open(page, route);
    const still = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "v-skeleton v-sheet v-scrim";
      document.querySelector(".student")?.appendChild(probe);
      const animation = getComputedStyle(probe).animationName;
      probe.remove();
      return { probe: animation, running: document.getAnimations().filter((item) => item.playState === "running").length };
    });
    expect(still).toEqual({ probe: "none", running: 0 });
    await page.context().close();
  });
}

test("the leaderboard table itself has no serious axe violations", async ({ page }) => {
  // Signed out, the page renders the labeled sample board, so the full table is in the DOM.
  await page.goto("/competition");
  await expect(page.getByText("Sample standings")).toBeVisible();
  await expect(page.getByRole("table").getByRole("row").nth(5)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  const stops = await tabStops(page, 20);
  expect(stops.filter((stop) => !stop.ring)).toEqual([]);
  expect(stops.some((stop) => stop.label === "button:Students")).toBe(true);
});

test("the trade sheet traps focus, closes on Escape, and returns focus to Trade", async ({ browser }) => {
  const page = await signedInPage(browser, student);
  await open(page, routes[1]);
  const trigger = page.getByRole("button", { name: "Trade", exact: true }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Trade" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  // Contrast is measured once the slide-in has finished, not on a half-transparent frame.
  await sheet.evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  expect(await seriousViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.context().close();
});

test("motion that runs by default is removed under reduced motion", async ({ browser }) => {
  const animationOf = async (reducedMotion: "reduce" | "no-preference") => {
    const page = await signedInPage(browser, student, { reducedMotion });
    await open(page, routes[1]);
    await page.getByRole("button", { name: "Trade", exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "Trade" });
    await expect(sheet).toBeVisible();
    const name = await sheet.evaluate((node) => getComputedStyle(node).animationName);
    const methodology = page.getByText("How ranking works");
    await page.keyboard.press("Escape");
    await page.goto("/competition");
    await methodology.click();
    const turning = await page.evaluate(() => document.getAnimations().filter((item) => item.playState === "running").length);
    await page.context().close();
    return { sheet: name, turning };
  };
  expect((await animationOf("no-preference")).sheet).toBe("v-slide");
  expect(await animationOf("reduce")).toEqual({ sheet: "none", turning: 0 });
});
