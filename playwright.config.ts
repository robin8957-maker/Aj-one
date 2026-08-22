import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
