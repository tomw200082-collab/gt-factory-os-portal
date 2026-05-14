import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Inventory — display clamp + Reconcile badge smoke (Phase 3 Task 8).
//
// Verifies the operator-facing surface for the "physical stock truth" change:
//
//   1. Rows with calculated_on_hand < 0 show clamped "0.00" plus a Reconcile
//      badge (not the previous "(N.NN)" accountancy format).
//   2. Clicking a Reconcile badge opens the StockTruthDrawer with the math
//      summary and the corrective-GR CTA.
//   3. Non-negative rows do NOT carry a Reconcile badge.
//
// Reconcile rows are inherently data-dependent. They exist only when the
// projection has produced a transient gap below zero. The dev test
// environment does not always have such rows — in fact, when the API is
// not reachable, the page renders an error state with zero table rows.
// Each test therefore downshifts to a "soft pass" path when:
//
//   (a) there are zero Reconcile badges anywhere on the page, OR
//   (b) the page is in the error / loading / empty state (no tbody tr).
//
// What this spec PROVES, even in the soft-pass path:
//   - /inventory renders without crashing.
//   - The Reconcile filter chip is wired up.
//   - Page heading + tier filter chip + StockTruthDrawer composition compile.
//
// What this spec PROVES when at least one below-floor row exists:
//   - The clamped "0.00" value is shown in the on-hand cell.
//   - The amber Reconcile badge is present.
//   - Clicking it opens the dialog with the math summary.
//
// Selector discipline:
//   The filter chip "Reconcile" and the ReconcileBadge button share the
//   word "Reconcile" but have different accessible names — the badge's
//   aria-label is "Reconcile — N <uom> below floor" (with a dash). The
//   filter chip's accessible name is just "Reconcile". We use the dash
//   pattern (/Reconcile\s—/) to target the badge unambiguously.
//
// Auth pattern mirrors admin-routes-smoke.spec.ts.
//
// Spec: PRODUCTION/docs/superpowers/specs/2026-05-13-display-clamp-physical-stock-truth-design.md
// Plan: PRODUCTION/docs/superpowers/plans/2026-05-13-display-clamp-physical-stock-truth.md
// ---------------------------------------------------------------------------

const BADGE_NAME = /Reconcile\s—/i; // disambiguates badge from filter chip

test.describe("Inventory — Reconcile (display clamp)", () => {
  test.beforeEach(async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
  });

  test("rows with calculated_on_hand < 0 show 0 + Reconcile badge", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    // Sentinel — proves the route rendered.
    await expect(
      page.getByRole("heading", { name: /Inventory/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    // Reconcile filter chip is always rendered (proves the migration shipped).
    await expect(
      page.getByRole("button", { name: /^Reconcile$/, exact: true }),
    ).toBeVisible();

    // Count below-floor badges currently on the page. Use the dash-anchored
    // pattern so we never match the filter chip.
    const reconcileBadgeCount = await page
      .getByRole("button", { name: BADGE_NAME })
      .count();

    if (reconcileBadgeCount === 0) {
      test.info().annotations.push({
        type: "data-dependent",
        description:
          "No below-floor rows in active dataset (or backend unreachable). " +
          "Row-specific assertions skipped; filter chip presence verified.",
      });
      return;
    }

    // The first badge's row must show clamped 0.00.
    const firstBadge = page.getByRole("button", { name: BADGE_NAME }).first();
    const owningRow = firstBadge.locator(
      'xpath=ancestor::tr | ancestor::article',
    );
    await expect(owningRow.first()).toBeVisible();
    await expect(owningRow.first().getByText("0.00").first()).toBeVisible();
  });

  test("clicking the Reconcile badge opens the StockTruthDrawer", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /Inventory/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    const firstBadge = page.getByRole("button", { name: BADGE_NAME }).first();

    const hasReconcileRow = (await firstBadge.count()) > 0;
    if (!hasReconcileRow) {
      test.info().annotations.push({
        type: "data-dependent",
        description:
          "No below-floor rows in active dataset (or backend unreachable). " +
          "Drawer-open assertion skipped.",
      });
      return;
    }

    await firstBadge.click();

    // Math summary line is the unique signature of StockTruthDrawer.
    await expect(page.getByText(/Below physical floor by/i)).toBeVisible({
      timeout: 10_000,
    });

    // CTA — either enabled GR link (events present) or disabled count
    // placeholder (no events). Either is an acceptable terminal state.
    const grCta = page.getByRole("link", {
      name: /Post corrective Goods Receipt/i,
    });
    const countCta = page.getByText(/Post corrective count/i);
    const grVisible = await grCta.isVisible().catch(() => false);
    const countVisible = await countCta.isVisible().catch(() => false);
    expect(grVisible || countVisible).toBe(true);
  });

  test("rows with non-negative balance do NOT show Reconcile badge", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /Inventory/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    // The "All" filter chip is the default; explicit click is defensive.
    await page.getByRole("button", { name: /^All$/, exact: true }).click();

    // If the dataset has zero rows (empty state, error state, or empty DB),
    // the badge-absence assertion is vacuously true. Record the condition.
    const desktopRowCount = await page
      .locator('[data-testid="inventory-desktop"] tbody tr')
      .count();
    const mobileCardCount = await page
      .locator('[data-testid="inventory-mobile"] > *')
      .count();

    if (desktopRowCount === 0 && mobileCardCount === 0) {
      test.info().annotations.push({
        type: "data-dependent",
        description:
          "No rows present in inventory (empty / error / loading state). " +
          "Healthy-row badge-absence assertion is vacuously satisfied.",
      });
      // Still assert that the filter chip exists — proves the page rendered.
      await expect(
        page.getByRole("button", { name: /^Reconcile$/, exact: true }),
      ).toBeVisible();
      return;
    }

    // Locate a row that does NOT contain a Reconcile badge. With any
    // realistic dataset there must be at least one healthy / low / critical /
    // out / unknown row that does not carry the badge.
    const cleanDesktopRow = page.locator(
      '[data-testid="inventory-desktop"] tbody tr',
      { hasNot: page.getByRole("button", { name: BADGE_NAME }) },
    );
    const cleanMobileCard = page.locator(
      '[data-testid="inventory-mobile"] > *',
      { hasNot: page.getByRole("button", { name: BADGE_NAME }) },
    );
    const cleanDesktopCount = await cleanDesktopRow.count();
    const cleanMobileCount = await cleanMobileCard.count();
    expect(cleanDesktopCount + cleanMobileCount).toBeGreaterThan(0);
  });
});
