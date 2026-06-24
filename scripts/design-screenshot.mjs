// ---------------------------------------------------------------------------
// design-screenshot.mjs — visual-feedback harness for the autonomous design loop.
//
// Renders a portal route in a headless Chromium with a dev-shim fake session
// and writes a full-page PNG. Lets the design loop judge UI by pixels instead
// of generating blind. Reuses the same fake-auth localStorage key the e2e
// suite uses (gt.fakeauth.v1, see tests/e2e/helpers.ts).
//
// Output goes to test-results/design-shots/ (gitignored) — no binaries are
// committed. Requires a dev server already running (default :3737).
//
// Usage:
//   node scripts/design-screenshot.mjs <route> [role] [outName]
//   node scripts/design-screenshot.mjs /dashboard admin dashboard
//   SHOT_VIEWPORT=mobile node scripts/design-screenshot.mjs /planning planner
//
// Env:
//   SHOT_BASE_URL   default http://127.0.0.1:3737
//   SHOT_VIEWPORT   "desktop" (1440x900, default) | "mobile" (390x844)
//   SHOT_OUT_DIR    default test-results/design-shots
// ---------------------------------------------------------------------------

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SHOT_BASE_URL || "http://127.0.0.1:3737";
const OUT_DIR = process.env.SHOT_OUT_DIR || "test-results/design-shots";
const route = process.argv[2] || "/dashboard";
const role = process.argv[3] || "admin";
const outName =
  process.argv[4] ||
  route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") ||
  "home";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const viewport = VIEWPORTS[process.env.SHOT_VIEWPORT === "mobile" ? "mobile" : "desktop"];

// Mirror tests/e2e/helpers.ts fake sessions so role-gated surfaces render.
const SESSIONS = {
  operator: { user_id: "u_op_01", display_name: "Avi (operator)", email: "operator@fake.gtfactory", role: "operator" },
  planner: { user_id: "u_pl_01", display_name: "Tom (planner)", email: "planner@fake.gtfactory", role: "planner" },
  admin: { user_id: "u_ad_01", display_name: "Alex (admin)", email: "admin@fake.gtfactory", role: "admin" },
  viewer: { user_id: "u_vw_01", display_name: "Guest (viewer)", email: "viewer@fake.gtfactory", role: "viewer" },
};
if (!SESSIONS[role]) {
  console.error(`Unknown role "${role}". Use one of: ${Object.keys(SESSIONS).join(", ")}`);
  process.exit(2);
}

// Escape hatch for sandboxes that pre-provision a browser binary at a revision
// that doesn't match the installed Playwright build (mirrors playwright.config.ts).
const launchOptions = process.env.PW_CHROME_PATH
  ? { executablePath: process.env.PW_CHROME_PATH }
  : {};
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const dark = process.env.SHOT_DARK === "1";
// ThemeProvider reads theme_preference off the session (it wins over the
// gt-theme localStorage pre-paint hint), so set both for a stable dark render.
const session = dark ? { ...SESSIONS[role], theme_preference: "dark" } : SESSIONS[role];

await page.addInitScript(
  (args) => {
    window.localStorage.setItem("gt.fakeauth.v1", args.session);
    if (args.dark) {
      window.localStorage.setItem("gt-theme", "dark");
      document.documentElement.classList.add("dark");
    }
  },
  { session: JSON.stringify(session), dark },
);

const url = BASE + route;
try {
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
} catch (err) {
  console.error(`Navigation warning for ${url}: ${err.message} (capturing whatever rendered)`);
}
// Let client components hydrate + any in-flight query settle into a terminal
// (data / empty / error) state before the shot.
await page.waitForTimeout(2_000);

await mkdir(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `${outName}.png`);
await page.screenshot({ path: out, fullPage: true });
console.log(`SHOT: ${out}  (${role} @ ${viewport.width}x${viewport.height})  ${url}`);

await browser.close();
