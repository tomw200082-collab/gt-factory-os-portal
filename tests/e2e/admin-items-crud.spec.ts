import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

test.describe("Admin items — happy-path create", () => {
  test("admin can open /admin/items, create a new item, and see it in the list", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "admin");
    await page.goto("/admin/items");

    // List renders the seeded items.
    await expect(
      page.getByRole("heading", { level: 1, name: "Items" })
    ).toBeVisible();
    await expect(page.getByText("Mojito cocktail 450ml")).toBeVisible();

    // "+ New item" is visible (only for admin).
    const newBtn = page.getByTestId("new-item-btn");
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // The detail panel opens as "New item".
    await expect(page.getByRole("heading", { name: "New item" })).toBeVisible();

    // Fill the form.
    // Phase A: the input for the item primary key is now data-testid
    // 'item-id-input' (renamed from 'item-sku-input') because the
    // locked schema uses item_id as the text PK, not a synthetic sku.
    await page.getByTestId("item-id-input").fill("FG-TEST-001");
    await page.getByTestId("item-name-input").fill("Test item from E2E");

    // Submit.
    await page.getByTestId("save-item-btn").click();

    // After create, the detail panel closes and the new row appears in the list.
    await expect(page.getByText("Test item from E2E")).toBeVisible();
    await expect(page.getByText("FG-TEST-001")).toBeVisible();
  });

  test("planner sees items read-only (no + New item button)", async ({ page }) => {
    await resetIdb(page);
    await setFakeRole(page, "planner");
    await page.goto("/admin/items");

    await expect(
      page.getByRole("heading", { level: 1, name: "Items" })
    ).toBeVisible();
    await expect(page.getByTestId("new-item-btn")).toHaveCount(0);
    await expect(page.getByText("read-only for planner")).toBeVisible();
  });
});
