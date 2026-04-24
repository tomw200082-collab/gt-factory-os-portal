import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Weekly Inventory Outlook — REAL HTTP path against the W1 API + Postgres.
//
// Prerequisites:
//   1. API server on 127.0.0.1:3333 with /api/v1/queries/inventory/weekly-outlook
//   2. Portal Next dev started by Playwright's webServer on 127.0.0.1:3737
//
// Convention: three terminal states — populated, empty-state, error.
// ---------------------------------------------------------------------------

test.describe("Weekly Inventory Outlook page", () => {
  test("T01 planner loads page — heading visible", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/weekly-outlook");

    await expect(
      page.getByRole("heading", { name: /Weekly Inventory Outlook/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("T02 page resolves to one of three terminal states", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/weekly-outlook");

    await expect(
      page.getByRole("heading", { name: /Weekly Inventory Outlook/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Terminal states:
    // (a) Matrix table renders with at least one row
    // (b) "No completed planning run" empty state
    // (c) Error banner
    await expect
      .poll(
        async () => {
          const hasTable = await page
            .locator("table")
            .isVisible()
            .catch(() => false);
          const hasEmpty = await page
            .getByText(/No completed planning run/i)
            .isVisible()
            .catch(() => false);
          const hasError = await page
            .getByText(/Failed to load weekly outlook/i)
            .isVisible()
            .catch(() => false);
          return hasTable || hasEmpty || hasError;
        },
        { timeout: 15_000, intervals: [500] },
      )
      .toBe(true);
  });

  test("T03 when data exists — run metadata strip is visible", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/weekly-outlook");

    await page.waitForTimeout(8_000);

    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    await expect(page.getByText(/Planning run executed:/i)).toBeVisible();
    await expect(page.getByText(/Horizon:/i)).toBeVisible();
  });

  test("T04 when data exists — matrix has week columns and item rows", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/weekly-outlook");

    await page.waitForTimeout(8_000);

    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    // Header row should have at least 2 columns (item + at least 1 week).
    const headerCells = page.locator("thead th");
    const colCount = await headerCells.count();
    expect(colCount).toBeGreaterThanOrEqual(2);

    // Tbody should have at least 1 item row.
    const bodyRows = page.locator("tbody tr");
    const rowCount = await bodyRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test("T05 when data exists — legend is visible", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning/weekly-outlook");

    await page.waitForTimeout(8_000);

    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    await expect(page.getByText(/Safe/i)).toBeVisible();
    await expect(page.getByText(/Low/i)).toBeVisible();
    await expect(page.getByText(/Shortage/i)).toBeVisible();
  });

  test("T06 admin also sees the page (any role can view)", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");

    await page.goto("/planning/weekly-outlook");

    await expect(
      page.getByRole("heading", { name: /Weekly Inventory Outlook/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("T07 planning corridor landing page has link to weekly-outlook", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/planning");

    await expect(
      page.getByText(/Planning corridor/i),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("link", { name: /Weekly Inventory Outlook/i }),
    ).toBeVisible();
  });
});
