import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3737",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Mobile WebKit emulation — used by tests/e2e/mobile-input-zoom.spec.ts
      // to verify the iOS focus-zoom CSS rule from globals.css. Playwright's
      // WebKit engine is the same engine iOS Safari ships with, so font-size
      // and media-query behavior match production iOS.
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
      testMatch: /mobile-.*\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "npx next dev -p 3737",
    url: "http://127.0.0.1:3737",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
