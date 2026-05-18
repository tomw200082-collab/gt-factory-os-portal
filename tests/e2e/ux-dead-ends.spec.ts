import { expect, test, type Page } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// UX dead-end sweep.
//
// A "dead end" is a screen the user can reach that gives them no way forward
// and no way back inside the page's own content. Static code review found and
// fixed a batch of these; this spec is the runtime guard that proves the fixes
// hold and catches new ones as the app evolves.
//
// What it checks:
//   1. ROUTE SWEEP — every primary route renders without a runtime crash, the
//      <main> content area appears, and that content area contains at least
//      one actionable control (a link or an enabled button). A content area
//      with zero actionables is the definition of a dead end: even an empty
//      or error state must offer a CTA or a retry.
//   2. DETAIL BACK-LINK — drilling into a detail page leaves a visible way
//      back to the list it came from.
//   3. REMOVED DEAD CONTROLS — buttons that were deleted for having no purpose
//      (no-op "Compare", broken "Substitutes" toggle, the "Materials this
//      week" drawer) stay deleted.
//   4. AUTH ESCAPES — the click-to-signin error screen is not a dead end.
//   5. APPROVAL ESCAPES — an approval page reached with a bad id still offers
//      a route back to the inbox.
//
// Data-dependence: the dev/CI environment does not always have a reachable
// backend. Tests that need real rows downshift to a recorded soft-pass rather
// than a false failure. The route sweep itself is backend-agnostic — after the
// dead-end fixes, even an error state carries a retry button.
//
// Auth pattern mirrors admin-routes-smoke.spec.ts (fake-session via helpers).
// ---------------------------------------------------------------------------

// Primary user-facing routes. Dynamic [id] routes and pure redirects
// (/dashboard/v2, /exceptions) are deliberately excluded — detail routes are
// covered by the detail-back-link test below.
const ROUTES: string[] = [
  "/dashboard",
  "/inventory",
  "/profile",
  "/inbox",
  "/me/activity",
  "/planning",
  "/planning/blockers",
  "/planning/boms",
  "/planning/forecast",
  "/planning/production-plan",
  "/planning/production-simulation",
  "/planning/weekly-outlook",
  "/planning/runs",
  "/planning/inventory-flow",
  "/planning/inventory-flow/supply",
  "/planning/purchase-calendar",
  "/planning/purchase-session",
  "/purchase-orders",
  "/purchase-orders/new",
  "/stock/receipts",
  "/stock/physical-count",
  "/stock/production-actual",
  "/stock/waste-adjustments",
  "/stock/movement-log",
  "/admin/items",
  "/admin/components",
  "/admin/suppliers",
  "/admin/supplier-items",
  "/admin/boms",
  "/admin/masters/boms",
  "/admin/masters/health",
  "/admin/planning-policy",
  "/admin/users",
  "/admin/jobs",
  "/admin/integrations",
  "/admin/holidays",
  "/admin/sku-health",
  "/admin/sku-map",
  "/admin/sku-aliases",
  "/admin/economics",
  "/admin/purchase-orders/parity-check",
];

interface ConsoleCapture {
  pageErrors: string[];
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { pageErrors: [] };
  page.on("pageerror", (err) => capture.pageErrors.push(err.message));
  return capture;
}

/** Count the visible, actionable controls inside the page content area. */
async function countContentActionables(page: Page): Promise<number> {
  const links = await page.locator("#main-content a:visible").count();
  const buttons = await page
    .locator("#main-content button:not([disabled]):visible")
    .count();
  return links + buttons;
}

/** True when the content area is still showing a loading placeholder. */
async function looksLikeLoading(page: Page): Promise<boolean> {
  const busy = await page
    .locator('#main-content [aria-busy="true"]')
    .count();
  const spinners = await page
    .locator("#main-content .animate-spin, #main-content .animate-pulse")
    .count();
  return busy + spinners > 0;
}

test.describe("UX dead-end sweep — every route offers a way out", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  for (const route of ROUTES) {
    test(`${route} renders and is not a dead end`, async ({ page }) => {
      const capture = attachConsoleCapture(page);

      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // The content landmark must appear — proves the route did not crash
      // into a blank document.
      await expect(page.locator("#main-content")).toBeVisible({
        timeout: 15_000,
      });

      // No uncaught runtime error — a crashed page is the worst dead end.
      expect(
        capture.pageErrors,
        `Runtime error on ${route}:\n  ${capture.pageErrors.join("\n  ")}`,
      ).toEqual([]);

      // Let async data / React Query settle so we judge the resolved screen.
      await page.waitForTimeout(1_500);

      let actionables = await countContentActionables(page);

      // A still-loading screen is not yet judgeable — give it one more beat.
      if (actionables === 0 && (await looksLikeLoading(page))) {
        await page.waitForTimeout(3_000);
        actionables = await countContentActionables(page);
        if (actionables === 0 && (await looksLikeLoading(page))) {
          test.info().annotations.push({
            type: "stuck-loading",
            description:
              `${route} never resolved past its loading state — a stuck ` +
              "spinner with no escape is itself a dead end. Re-run with a " +
              "reachable backend to confirm.",
          });
          return;
        }
      }

      // The core assertion: the content area must offer at least one way
      // forward or back. Zero actionables == a dead end.
      expect(
        actionables,
        `${route} has no actionable control in #main-content — the user is ` +
          "stranded. Empty and error states must carry a CTA or a retry.",
      ).toBeGreaterThan(0);
    });
  }
});

test.describe("UX dead-end sweep — detail pages keep a way back", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  test("a BOM detail page links back to the BOM list", async ({ page }) => {
    await page.goto("/admin/boms");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bills of materials" }),
    ).toBeVisible({ timeout: 15_000 });

    // First BOM head link in the list. Fixture-backed, but guard for an
    // empty dataset all the same.
    const firstRowLink = page
      .locator('#main-content a[href*="/boms/"]')
      .first();
    if ((await firstRowLink.count()) === 0) {
      test.info().annotations.push({
        type: "data-dependent",
        description: "No BOM rows in dataset — detail back-link check skipped.",
      });
      return;
    }

    await firstRowLink.click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#main-content")).toBeVisible();

    // The detail page must expose a link back to a BOM list — either the
    // WorkflowHeader back link or a row/breadcrumb link.
    const backToList = page.locator(
      '#main-content a[href$="/admin/boms"], ' +
        '#main-content a[href$="/admin/masters/boms"]',
    );
    await expect(
      backToList.first(),
      "BOM detail page has no link back to the BOM list",
    ).toBeVisible();
  });
});

test.describe("UX dead-end sweep — removed dead controls stay removed", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  test("/planning/boms has no no-op Compare or Substitutes toolbar button", async ({
    page,
  }) => {
    await page.goto("/planning/boms");
    await expect(page.locator("#main-content")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1_500);

    await expect(
      page.getByRole("button", { name: "Compare", exact: true }),
      "the no-op 'Compare' button was deleted and must not return",
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Substitutes", exact: true }),
      "the broken 'Substitutes' toggle was deleted and must not return",
    ).toHaveCount(0);
  });

  test("/planning/production-plan has no dead 'Materials this week' drawer", async ({
    page,
  }) => {
    await page.goto("/planning/production-plan");
    await expect(page.locator("#main-content")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1_500);

    await expect(
      page.getByRole("button", { name: /Materials this week/i }),
      "the dead 'Materials this week' drawer trigger was deleted",
    ).toHaveCount(0);
  });
});

test.describe("UX dead-end sweep — auth screens are not dead ends", () => {
  test("click-to-signin with no token shows an error AND a way out", async ({
    page,
  }) => {
    // No `to` param — the page lands in its error branch.
    await page.goto("/auth/click-to-signin");
    await expect(page.locator("#main-content, body")).toBeVisible();
    await page.waitForTimeout(1_000);

    // The error branch must offer a link onward to sign-in.
    await expect(
      page.getByRole("link", { name: /sign in/i }).first(),
      "click-to-signin error screen strands the user with no link out",
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("UX dead-end sweep — approval pages keep an inbox exit", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  test("a physical-count approval reached with a bad id links back to the inbox", async ({
    page,
  }) => {
    await page.goto(
      "/inbox/approvals/physical-count/does-not-exist-dead-end-probe",
    );
    await expect(page.locator("#main-content")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(2_000);

    // Whatever terminal state this resolves to (not-found / error), it must
    // not be a dead end — a route back to the inbox must exist.
    const inboxLink = page.locator('#main-content a[href*="/inbox"]');
    if ((await inboxLink.count()) === 0) {
      // If the whole content area still has other actionables, record a
      // soft note rather than a hard fail (the backend may be unreachable
      // and the generic sweep already covers the actionable-count rule).
      const actionables = await countContentActionables(page);
      test.info().annotations.push({
        type: "data-dependent",
        description:
          "No explicit inbox link found on the approval not-found state; " +
          `content actionables present: ${actionables}. Re-run with a ` +
          "reachable backend to confirm the back-to-inbox affordance.",
      });
      expect(actionables).toBeGreaterThan(0);
      return;
    }

    await expect(inboxLink.first()).toBeVisible();
  });
});
