import { test, expect } from "@playwright/test";

const PAGES = [
  "/",
  "/login",
  "/overlay",
  "/control",
  "/connections",
  "/hub",
  "/radar",
  "/fleet",
  "/settings",
  "/approvals",
  "/artifacts",
  "/automations",
  "/decisions",
  "/knowledge",
  "/memory",
  "/resources",
] as const;

for (const path of PAGES) {
  test(`page ${path} returns a document`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status() ?? 200).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("filling the composer enables submit", async ({ page }) => {
  await page.goto("/");
  const input = page.getByTestId("objective-input");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill("Add GET /health that returns { ok: true, service: 'northstar' }");
  await expect(page.getByTestId("submit-mission")).toBeEnabled();
});

test("work mode button can be clicked twice", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("work-mode-btn").click();
  await page.getByTestId("one-mode-btn").click();
  await expect(page.getByTestId("objective-input")).toBeVisible({ timeout: 15_000 });
});

test("skip login is always available", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("skip-login")).toBeEnabled();
});

test("overlay stop control is enabled", async ({ page }) => {
  await page.goto("/overlay");
  await expect(page.getByTestId("overlay-mission-pause")).toBeEnabled();
});
