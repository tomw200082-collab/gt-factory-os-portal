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
    // Escape hatch for sandboxes that pre-provision a browser binary but can't
    // download Playwright's pinned build. Unset in CI → Playwright uses its own
    // downloaded browser as normal.
    //
    // POINT IT AT THE HEADLESS SHELL, NOT THE FULL CHROMIUM BUILD:
    //   PW_CHROME_PATH=/opt/pw-browsers/chromium_headless_shell-<rev>/chrome-linux/headless_shell
    // and NOT .../chromium-<rev>/chrome-linux/chrome.
    //
    // This is not a preference. On the full binary (new-headless mode) no
    // synthesised mouse event is delivered to the page at all while a fixed
    // overlay is mounted — so every in-sheet `locator.click()` silently does
    // nothing, the write it should trigger never fires, and the assertion after
    // it fails pointing at product code that is perfectly fine. The two binaries
    // are the SAME revision; the revision is not the variable, the mode is.
    // Measured 2026-08-24: sales-today.spec.ts is 5 passed/1 failed on `chrome`
    // and 6/6 on `headless_shell`, same tree, same commit, CI green throughout.
    // It cost one session a phantom regression report against _lib/api.ts.
    launchOptions: process.env.PW_CHROME_PATH
      ? { executablePath: process.env.PW_CHROME_PATH }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(mobile|tablet)-.*\.spec\.ts$/,
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
    {
      // Tablet WebKit emulation (iPad Mini, 768x1024 portrait) — 768px is
      // Tailwind's md breakpoint, the exact mobile->tablet transition zone
      // where responsive classes are most likely to break. Used by
      // tablet-*.spec.ts screenshot passes.
      name: "tablet",
      use: { ...devices["iPad Mini"] },
      testMatch: /tablet-.*\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "npx next dev -p 3737",
    url: "http://127.0.0.1:3737",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    // CI sets this at job level (portal-pr-guard.yml); a local run inherited
    // whatever the operator's shell happened to have. Without it every @mocked
    // sales spec 307s to the sign-in wall and fails on locators that never
    // exist — a failure that looks like the feature and is actually the
    // harness. Pinned here so a local run cannot silently diverge from CI.
    env: { NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH: "true" },
  },
});
