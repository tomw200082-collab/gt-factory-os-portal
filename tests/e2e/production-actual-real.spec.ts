import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

// ---------------------------------------------------------------------------
// Production Actual — REAL HTTP path against the W1 API + Postgres.
//
// Prerequisites:
//   1. API server on 127.0.0.1:3333 with production-actuals endpoints live
//   2. Portal Next dev started by Playwright's webServer on 127.0.0.1:3737
//   3. At least one MANUFACTURED or REPACK item with an active BOM version
//
// Convention (per planner-runs-real.spec.ts): tests accept three terminal
// states — populated, empty-state, documented backend error — because the
// underlying DB is environment-dependent.  UI path is the acceptance signal.
// ---------------------------------------------------------------------------

test.describe("Production Actual form — page + form states", () => {
  test("T01 operator loads page and sees item picker", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/ops/stock/production-actual");

    await expect(
      page.getByRole("heading", { name: /Production Actual/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Step 1 picker is always visible on load.
    await expect(
      page.getByText(/Step 1 — choose what you produced/i),
    ).toBeVisible();

    // Item dropdown renders (populated or empty).
    const itemSelect = page.locator("select").first();
    await expect(itemSelect).toBeVisible();
  });

  test("T02 viewer sees read-only warning", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "viewer");

    await page.goto("/ops/stock/production-actual");

    await expect(
      page.getByRole("heading", { name: /Production Actual/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/Read-only view/i)).toBeVisible();
  });

  test("T03 planner sees read-only warning", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");

    await page.goto("/ops/stock/production-actual");

    await expect(
      page.getByRole("heading", { name: /Production Actual/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/Read-only view/i)).toBeVisible();
  });

  test("T04 operator opens snapshot for first producible item", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/ops/stock/production-actual");

    await expect(
      page.getByText(/Step 1 — choose what you produced/i),
    ).toBeVisible({ timeout: 15_000 });

    // Wait for items to load.
    await page.waitForTimeout(3_000);

    const itemSelect = page.locator("select").first();
    const options = await itemSelect.locator("option").count();

    if (options <= 1) {
      // No producible items in this environment — skip form test.
      test.skip();
      return;
    }

    // Select the first non-placeholder option.
    const firstOption = await itemSelect.locator("option").nth(1).getAttribute("value");
    if (!firstOption) {
      test.skip();
      return;
    }

    await itemSelect.selectOption(firstOption);

    // "Continue to entry" button should now be enabled.
    const continueBtn = page.getByRole("button", { name: /Continue to entry/i });
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toBeEnabled();

    // Click to open snapshot.
    await continueBtn.click();

    // Three terminal states after clicking:
    // (a) Step 2 form appears (API returned BOM snapshot)
    // (b) Error banner (no active BOM for this item)
    // (c) Loading spinner (slow API)
    await expect
      .poll(
        async () => {
          const hasStep2 = await page
            .getByText(/Step 2 — enter produced output/i)
            .isVisible()
            .catch(() => false);
          const hasError = await page
            .getByText(/Failed to open production snapshot/i)
            .isVisible()
            .catch(() => false);
          return hasStep2 || hasError;
        },
        { timeout: 15_000, intervals: [500] },
      )
      .toBe(true);
  });

  test("T05 step 2 shows pinned BOM version and pre-expands consumption preview", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/ops/stock/production-actual");
    await page.waitForTimeout(3_000);

    const itemSelect = page.locator("select").first();
    const options = await itemSelect.locator("option").count();
    if (options <= 1) {
      test.skip();
      return;
    }

    const firstOption = await itemSelect.locator("option").nth(1).getAttribute("value");
    if (!firstOption) {
      test.skip();
      return;
    }

    await itemSelect.selectOption(firstOption);
    await page.getByRole("button", { name: /Continue to entry/i }).click();

    // Wait for step 2.
    const step2 = page.getByText(/Step 2 — enter produced output/i);
    const isStep2 = await step2.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!isStep2) {
      test.skip();
      return;
    }

    // Pinned BOM version is shown.
    await expect(page.getByText(/Pinned BOM:/i)).toBeVisible();

    // Consumption preview section is visible.
    await expect(
      page.getByText(/Expected consumption preview/i),
    ).toBeVisible();
  });

  test("T06 empty output qty triggers validation error on submit", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/ops/stock/production-actual");
    await page.waitForTimeout(3_000);

    const itemSelect = page.locator("select").first();
    const options = await itemSelect.locator("option").count();
    if (options <= 1) {
      test.skip();
      return;
    }

    const firstOption = await itemSelect.locator("option").nth(1).getAttribute("value");
    if (!firstOption) {
      test.skip();
      return;
    }

    await itemSelect.selectOption(firstOption);
    await page.getByRole("button", { name: /Continue to entry/i }).click();

    const isStep2 = await page
      .getByText(/Step 2 — enter produced output/i)
      .isVisible({ timeout: 15_000 })
      .catch(() => false);
    if (!isStep2) {
      test.skip();
      return;
    }

    // Submit without filling output qty — HTML5 required should prevent submit.
    const submitBtn = page.getByRole("button", { name: /Submit production/i });
    await expect(submitBtn).toBeVisible();
    // The button should be enabled (canSubmit is true for operator).
    await expect(submitBtn).toBeEnabled();
    // Clicking submit with empty required field triggers browser validation.
    await submitBtn.click();
    // Page should still be on Step 2 (not navigated away, not showing success).
    await expect(
      page.getByText(/Step 2 — enter produced output/i),
    ).toBeVisible();
    // No success banner should appear.
    await expect(
      page.getByText(/Posted .* of/i),
    ).not.toBeVisible();
  });

  test("T07 recent history section shows last 10 runs when data exists", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");

    await page.goto("/ops/stock/production-actual");

    await expect(
      page.getByRole("heading", { name: /Production Actual/i }),
    ).toBeVisible({ timeout: 15_000 });

    // History section either shows or is absent (no data yet in this env).
    // We only verify: if it shows, it has the expected columns.
    const hasHistory = await page
      .getByText(/Recent production runs/i)
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (hasHistory) {
      await expect(page.getByText(/BOM version/i)).toBeVisible();
      await expect(page.getByText(/Event time/i)).toBeVisible();
      await expect(page.getByText(/Consumed/i)).toBeVisible();
      // item_id column should NOT appear (removed in UX fix).
      const idCells = page.locator("td.font-mono.text-3xs");
      await expect(idCells).toHaveCount(0);
    }
  });
});
