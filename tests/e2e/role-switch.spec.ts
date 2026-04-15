import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe("Fake login / role switch", () => {
  test("defaults to planner and shows the FAKE SESSION chip", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("FAKE SESSION")).toBeVisible();
    await expect(page.getByText("Tom (planner)")).toBeVisible();
  });

  test("switching to operator role hides planner nav items", async ({ page }) => {
    await setFakeRole(page, "operator");
    await page.goto("/dashboard");

    await expect(page.getByText("FAKE SESSION")).toBeVisible();
    await expect(page.getByText("Avi (operator)")).toBeVisible();

    // Operator nav contains Goods Receipt, planner nav does not.
    await expect(page.getByRole("link", { name: /Goods Receipt/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Forecast$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Purchase Recs/i })).toHaveCount(0);
  });

  test("switching to admin role reveals admin master-data nav", async ({ page }) => {
    await setFakeRole(page, "admin");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /^Items$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Components$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^BOMs$/i })).toBeVisible();
  });

  test("viewer role sees dashboard but no operator forms", async ({ page }) => {
    await setFakeRole(page, "viewer");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /^Dashboard$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Goods Receipt/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Waste/i })).toHaveCount(0);
  });

  test("operator cannot reach the admin items page even by direct URL", async ({ page }) => {
    await setFakeRole(page, "operator");
    await page.goto("/admin/items");
    // RoleGate renders the 'Not available for your role' card.
    await expect(page.getByText(/Not available for your role/i)).toBeVisible();
  });
});
