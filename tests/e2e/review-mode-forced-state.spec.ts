import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole, setReviewForcedState } from "./helpers";

test.describe("Review mode — forced state rendering", () => {
  test("forcing 'success' on Goods Receipt renders the success card without touching the form", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
    await setReviewForcedState(page, "success");
    await page.goto("/ops/receipts");

    await expect(
      page.getByRole("heading", { name: "Goods Receipt" })
    ).toBeVisible();
    await expect(page.getByText(/Receipt recorded \(mock\)/i)).toBeVisible();

    // The form itself is not rendered in this state.
    await expect(
      page.getByRole("button", { name: "Submit receipt" })
    ).toHaveCount(0);
  });

  test("forcing 'approval_required' renders the held-for-review banner", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
    await setReviewForcedState(page, "approval_required");
    await page.goto("/ops/receipts");

    await expect(page.getByText(/Held for review/i)).toBeVisible();
  });

  test("forcing 'stale_conflict' renders the PO-state-changed stale notice", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
    await setReviewForcedState(page, "stale_conflict");
    await page.goto("/ops/receipts");

    await expect(page.getByText(/PO state changed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Back to form/i })).toBeVisible();
  });
});
