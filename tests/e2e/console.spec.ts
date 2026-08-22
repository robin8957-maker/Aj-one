import { test, expect } from "@playwright/test";

test.describe("ALJWHARAH ONE console", () => {
  test("home loads the workstation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ALJWHARAH ONE/i);
    await expect(page.getByTestId("workstation")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("mission-list")).toBeVisible();
  });

  test("composer and submit controls are present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("objective-input")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("submit-mission")).toBeVisible();
  });

  test("login skip returns to the workstation", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("skip-login")).toBeVisible();
    await page.getByTestId("skip-login").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("mission-list")).toBeVisible({ timeout: 20_000 });
  });

  test("login offers Google and X when auth is on", async ({ page }) => {
    await page.goto("/login");
    const google = page.getByTestId("google-login");
    const skip = page.getByTestId("skip-login");
    await expect(skip).toBeVisible();
    if (await google.count()) await expect(google).toBeVisible();
  });

  test("work mode toggle exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("work-mode-btn")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("work-mode-btn").click();
    await expect(page.getByTestId("work-room")).toBeVisible({ timeout: 15_000 });
  });

  test("work room does not execute until a decision exists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("work-mode-btn").click();
    await expect(page.getByTestId("work-room")).toBeVisible({ timeout: 15_000 });
    const execute = page.getByTestId("execute-btn");
    if (await execute.count()) await expect(execute).toBeDisabled();
  });

  test("overlay panel exposes commander controls", async ({ page }) => {
    await page.goto("/overlay");
    await expect(page.getByTestId("overlay-panel")).toBeVisible();
    await expect(page.getByTestId("overlay-mission-pause")).toBeVisible();
    await expect(page.getByTestId("overlay-mission-resume")).toBeVisible();
    await expect(page.getByTestId("overlay-mission-panic")).toHaveCount(1);
  });

  test("control panel loads", async ({ page }) => {
    await page.goto("/control");
    await expect(page.locator("body")).toContainText(/control|model|govern|local/i);
  });

  test("connections page loads", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.locator("body")).toContainText(/model|connect|local|engine/i);
  });

  test("hub page loads", async ({ page }) => {
    await page.goto("/hub");
    await expect(page.locator("body")).toContainText(/hub|mcp|agent|grant/i);
  });

  test("radar page loads", async ({ page }) => {
    await page.goto("/radar");
    await expect(page.locator("body")).toBeVisible();
  });

  test("fleet page loads", async ({ page }) => {
    await page.goto("/fleet");
    await expect(page.locator("body")).toBeVisible();
  });

  test("settings page loads language controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("body")).toContainText(/language|English|العربية|machine/i);
  });

  test("approvals page loads", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.locator("body")).toBeVisible();
  });

  test("artifacts page exposes the list", async ({ page }) => {
    await page.goto("/artifacts");
    await expect(page.getByTestId("artifact-list")).toBeVisible();
  });

  test("automations page loads", async ({ page }) => {
    await page.goto("/automations");
    await expect(page.locator("body")).toBeVisible();
  });

  test("decisions page loads", async ({ page }) => {
    await page.goto("/decisions");
    await expect(page.locator("body")).toBeVisible();
  });

  test("knowledge page loads", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.locator("body")).toBeVisible();
  });

  test("memory page loads", async ({ page }) => {
    await page.goto("/memory");
    await expect(page.locator("body")).toBeVisible();
  });

  test("resources page loads", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("body")).toBeVisible();
  });

  test("report route redirects or serves the report", async ({ page }) => {
    const res = await page.goto("/report");
    expect(res?.ok() || page.url().includes("report")).toBeTruthy();
  });

  test("unknown mission shows not found", async ({ page }) => {
    await page.goto("/missions/does-not-exist");
    await expect(page.locator("body")).toContainText(/not found|Mission/i);
  });

  test("artifacts query cannot dump .env", async ({ page }) => {
    await page.goto("/artifacts?path=../.env");
    await expect(page.locator("body")).not.toContainText(/AJ_MASTER_KEY\s*=/);
    await expect(page.locator("body")).not.toContainText(/DATABASE_URL\s*=/);
  });

  test("composer rejects empty submit", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByTestId("submit-mission");
    await expect(submit).toBeDisabled();
  });

  test("one mode button exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("one-mode-btn")).toBeVisible({ timeout: 20_000 });
  });

  test("title stays ALJWHARAH ONE", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("ALJWHARAH ONE");
  });

  test("windows chrome or workstation is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("workstation")).toBeVisible({ timeout: 20_000 });
  });

  test("login page has operator copy", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toContainText(/Sign in|OPERATOR|Aljwharah/i);
  });

  test("overlay is not the workstation", async ({ page }) => {
    await page.goto("/overlay");
    await expect(page.getByTestId("workstation")).toHaveCount(0);
    await expect(page.getByTestId("overlay-panel")).toBeVisible();
  });

  test("settings does not advertise a live cloud runtime", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("body")).not.toContainText("AWS Lambda");
  });
});
