// UX render-and-screenshot harness for the /ux-release-gate visual-evidence loop.
//
// Committed, parameterized, env-driven. Tagged @uxshot so the @mocked PR gate
// (portal-pr-guard runs `--grep @mocked`) never runs it — the UX gate invokes
// it explicitly with `--grep @uxshot`.
//
// The five UX agents DRIVE this file via Bash at audit time; they never edit it
// (report-only, SPEC §V5). Per-surface fixtures are passed in by file, not by
// editing this spec — so adding a screenshot never touches portal source.
//
// Auth path is the sanctioned dev-shim (NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true) +
// browser-stubbed APIs — the same no-backend pattern as the @mocked suite. It is
// NOT X-Fake-Session / X-Test-Session (those are hook-blocked). SPEC §V8/§V9.
//
// Run:
//   NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true \
//   UX_SHOT_ROUTE=/dashboard UX_SHOT_ROLE=planner \
//   npx playwright test tests/e2e/ux-shot.spec.ts --grep @uxshot --project=chromium
//
// Env:
//   UX_SHOT_ROUTE     (required) portal route to render, e.g. /planning/procurement
//   UX_SHOT_ROLE      operator|planner|admin|viewer (default: planner)
//   UX_SHOT_OUT       output dir for PNGs (default: /tmp/ux-shots)
//   UX_SHOT_FIXTURE   optional path to a JSON file { "<api-glob>": <response-json>, ... };
//                     each key is registered as a page.route returning { json: value }.
//                     "**/api/**" is always pre-registered as {} so unstubbed
//                     calls never hang the render.
//   UX_SHOT_VIEWPORT  desktop|mobile|both (default: both)
import { test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { setFakeRole } from "./helpers";

type Role = "operator" | "planner" | "admin" | "viewer";

const ROUTE = process.env.UX_SHOT_ROUTE ?? "";
const ROLE = (process.env.UX_SHOT_ROLE ?? "planner") as Role;
const OUT = process.env.UX_SHOT_OUT ?? "/tmp/ux-shots";
const FIXTURE = process.env.UX_SHOT_FIXTURE ?? "";
const VIEWPORT = process.env.UX_SHOT_VIEWPORT ?? "both";

function slug(route: string): string {
  return route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-") || "root";
}

async function applyFixture(page: Page): Promise<void> {
  // Generic fallback first — Playwright matches routes in reverse registration
  // order, so the specific fixture stubs registered after this one win.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  if (!FIXTURE) return;
  const map = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
  for (const [glob, value] of Object.entries(map)) {
    await page.route(glob, (route) => route.fulfill({ json: value }));
  }
}

async function shoot(page: Page, base: string, w: number, h: number, tag: string): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(ROUTE);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${base}-${tag}.png`, fullPage: true });
}

test.describe("@uxshot", () => {
  test(`render ${ROUTE || "(no route)"} as ${ROLE}`, async ({ page }) => {
    test.skip(!ROUTE, "UX_SHOT_ROUTE not set");
    mkdirSync(OUT, { recursive: true });
    await setFakeRole(page, ROLE);
    await applyFixture(page);
    const base = `${OUT}/${slug(ROUTE)}-${ROLE}`;
    if (VIEWPORT === "desktop" || VIEWPORT === "both") {
      await shoot(page, base, 1440, 900, "desktop");
    }
    if (VIEWPORT === "mobile" || VIEWPORT === "both") {
      await shoot(page, base, 390, 844, "mobile");
    }
  });
});
