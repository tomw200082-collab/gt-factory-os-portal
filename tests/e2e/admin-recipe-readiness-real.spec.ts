// Recipe-Readiness Corridor — Playwright happy-path E2E.
//
// Exercises §12 acceptance #1: from a clean product page, admin clones an
// active base BOM into a DRAFT, edits one quantity, publishes, lands back
// on the product page with a green Health card.
//
// Skipped unless TEST_RECIPE_ITEM_ID is supplied — the harness has no
// universal seed for a MANUFACTURED item with a fully sourced base BOM.

import { test, expect } from "@playwright/test";

const ITEM_ID = process.env.TEST_RECIPE_ITEM_ID ?? "";

test.skip(!ITEM_ID, "TEST_RECIPE_ITEM_ID not set — seed item required");

test("admin clones a base BOM, edits qty, publishes — lands green", async ({
  page,
}) => {
  await page.goto(`/admin/masters/items/${ITEM_ID}`);
  await expect(page.getByText("מתכון ייצור")).toBeVisible();

  const editBtns = page.getByRole("button", { name: /Edit recipe/ });
  await editBtns.first().click();

  // Editor opens with DRAFT pill
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();

  // Edit first row's qty
  const firstQtyEdit = page.getByLabel(/^qty-edit-/).first();
  await firstQtyEdit.click();
  const input = page.getByRole("textbox").first();
  await input.fill("1.25");
  await input.press("Tab");

  // Publish
  await page.getByRole("button", { name: /^Publish/ }).click();
  await expect(page.getByRole("dialog", { name: /Confirm publish/ })).toBeVisible();
  await page.getByRole("button", { name: /^Publish$/ }).click();

  // Land back on product page
  await expect(page).toHaveURL(new RegExp(`/admin/masters/items/${ITEM_ID}`));
  await expect(page.getByText(/מוכן לייצור/)).toBeVisible();
});
