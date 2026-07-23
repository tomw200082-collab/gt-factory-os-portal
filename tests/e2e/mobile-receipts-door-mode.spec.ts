import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Mobile-only spec — runs under the mobile-safari Playwright project
// (playwright.config.ts), iPhone 14 device (390x844, WebKit).
//
// Tranche 137 — door-mode screenshot pass for Dennis's phone at the RM door:
// landing picker (Expected today leads, manual demoted), PO track with the
// operator-role collapsed progress disclosure, and the pre-submit
// short-receipt summary. Not tagged @mocked (matches the existing
// mobile-operator-forms-smoke / mobile-input-zoom precedent in this repo) —
// portal-pr-guard only installs the chromium browser, so mobile-safari specs
// stay out of the `--grep @mocked` CI gate and are run manually with webkit
// installed locally.

const SUPPLIER = { supplier_id: "SUP1", supplier_name_official: "Acme Foods", status: "ACTIVE" };
const COMPONENT = {
  component_id: "C1",
  component_name: "Sugar 25kg",
  status: "ACTIVE",
  component_class: "INGREDIENT",
  inventory_uom: "KG",
  purchase_uom: "KG",
  bom_uom: "KG",
};

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PO = {
  po_id: "PO1",
  po_number: "PO-0001",
  supplier_id: "SUP1",
  status: "OPEN",
  expected_receive_date: todayIso(),
};
const PO_LINE = {
  po_line_id: "PL1",
  line_number: 1,
  component_id: "C1",
  component_name: "Sugar 25kg",
  item_id: null,
  item_name: null,
  ordered_qty: "20",
  uom: "KG",
  received_qty: "0",
  open_qty: "20",
  line_status: "OPEN",
};

test.describe("mobile WebKit (iPhone 14, 390px) — receipts door mode", () => {
  test("landing picker, PO track, and short-receipt summary render without a scroll trap", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await page.route("**/api/items**", (route) => route.fulfill({ json: { rows: [], count: 0 } }));
    await page.route("**/api/components**", (route) =>
      route.fulfill({ json: { rows: [COMPONENT], count: 1 } }),
    );
    await page.route("**/api/suppliers**", (route) =>
      route.fulfill({ json: { rows: [SUPPLIER], count: 1 } }),
    );
    await page.route("**/api/purchase-orders?status=OPEN&status=PARTIAL**", (route) =>
      route.fulfill({ json: { rows: [PO], count: 1 } }),
    );
    await page.route("**/api/purchase-order-lines**", (route) =>
      route.fulfill({ json: { rows: [PO_LINE], count: 1 } }),
    );

    await page.goto("/stock/receipts");
    await expect(page.getByTestId("receipt-landing-picker")).toBeVisible({ timeout: 15_000 });
    // Let the landing cards' lazy content (supplier names, bucket sort)
    // settle before the screenshot — avoids capturing an in-flight paint.
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "test-results/door-mode-screenshots/01-landing-picker.png",
      fullPage: true,
    });

    await page.getByTestId("receipt-landing-expected-row-PO1").click();
    await expect(page.getByTestId("receipt-po-ledger-header")).toBeVisible();
    // Door mode: progress detail collapsed by default for the operator role.
    await expect(page.getByTestId("receipt-po-ledger-progress-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    const qtyInput = page.locator("#receipt-line-qty-0");
    await expect(qtyInput).toHaveValue("20");
    await qtyInput.fill("12");
    await expect(page.getByTestId("receipt-short-receipt-summary")).toBeVisible();

    await page.screenshot({
      path: "test-results/door-mode-screenshots/02-po-track-short-receipt.png",
      fullPage: true,
    });

    // Sticky submit bar reachable without a scroll trap.
    await expect(page.getByTestId("receipt-submit")).toBeVisible();
  });
});
