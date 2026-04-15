import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

test.describe("Forecast workspace — dirty cell edit", () => {
  test("planner edits one cell and the dirty counter reflects it", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");
    await page.goto("/planning/forecast");

    await expect(page.getByRole("heading", { name: "Forecast" })).toBeVisible();
    // No dirty edits yet — the leading line reads "No pending cell edits".
    await expect(page.getByText(/no pending cell edits/i)).toBeVisible();

    // Edit the first numeric cell in the grid.
    const firstCell = page.locator('input[type="number"]').first();
    await firstCell.fill("999");
    await firstCell.blur();

    // Dirty counter updates to at least 1.
    await expect(page.getByText(/1 local cell edit pending save/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save 1 change/i })
    ).toBeEnabled();
  });

  test("viewer sees forecast read-only (no input cells)", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "viewer");
    await page.goto("/planning/forecast");

    await expect(page.getByRole("heading", { name: "Forecast" })).toBeVisible();
    // Header Badge "read-only" (exact match — avoids colliding with the
    // longer "Read-only view…" hint text that appears elsewhere).
    await expect(page.getByText("read-only", { exact: true })).toBeVisible();
    // No forecast cell editors.
    await expect(page.locator('input[type="number"]')).toHaveCount(0);
  });
});
