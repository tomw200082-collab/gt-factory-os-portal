import { expect, test } from "@playwright/test";
import { resetIdb, setFakeRole } from "./helpers";

test.describe("Goods Receipt — success path (mock view swap)", () => {
  test("operator fills a minimal receipt and lands on the success state", async ({
    page,
  }) => {
    await resetIdb(page);
    await setFakeRole(page, "operator");
    await page.goto("/ops/receipts");

    await expect(page.getByRole("heading", { name: "Goods Receipt" })).toBeVisible();

    // Pick a supplier via the scoped data-testid — this avoids collision
    // with the top-bar FAKE SESSION role switcher, which is the first
    // <select> in DOM order on every page.
    await page
      .getByTestId("receipt-supplier-select")
      .selectOption({ label: "Shikarei Eliyahu Ltd" });

    // Fill the first line's item picker — first option after the blank.
    await page.getByTestId("receipt-line-item-0").selectOption({ index: 1 });

    // Fill the first line's quantity.
    await page.getByTestId("receipt-line-qty-0").fill("12");

    // Submit.
    await page.getByRole("button", { name: "Submit receipt" }).click();

    // Success state.
    await expect(page.getByText(/Receipt recorded \(mock\)/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Record another receipt/i })
    ).toBeVisible();
  });
});
