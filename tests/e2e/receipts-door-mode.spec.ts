// ---------------------------------------------------------------------------
// Goods Receipt — door mode (Tranche 137).
//
// Tagged @mocked: stubs the master-data + PO endpoints and the goods-receipts
// POST at the browser so the operator-role landing → PO pick → short-receipt
// pre-submit summary → submit → success-panel delta flow is verified WITHOUT
// a live backend. Mirrors placement-queue.spec.ts's route-stub pattern.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

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

async function mockMasterData(page: import("@playwright/test").Page) {
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
}

test.describe("@mocked receipts door mode", () => {
  test("operator: pick expected-today PO, edit a line short, pre-submit summary, submit, success delta, PO stays OPEN", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await mockMasterData(page);
    await page.route("**/api/goods-receipts", (route) => {
      return route.fulfill({
        json: {
          submission_id: "SUB1",
          status: "posted",
          event_at: new Date().toISOString(),
          posted_at: new Date().toISOString(),
          supplier_id: "SUP1",
          po_id: "PO1",
          lines: [
            {
              line_id: "GRL1",
              item_type: "RM",
              item_id: "C1",
              quantity: "12",
              unit: "KG",
              stock_ledger_movement_id: "MOV1",
            },
          ],
          idempotent_replay: false,
        },
      });
    });

    await page.goto("/stock/receipts");

    // Door-mode default: land on the picker, "Expected today" card leads.
    await expect(page.getByTestId("receipt-landing-picker")).toBeVisible();
    // Manual track stays reachable but reads as secondary (outline button).
    const manualBtn = page.getByTestId("receipt-landing-manual-start");
    await expect(manualBtn).toBeVisible();
    await expect(manualBtn).not.toHaveClass(/btn-primary/);

    await page.getByTestId("receipt-landing-expected-row-PO1").click();

    // PO track active — ledger header shows the OPEN status.
    await expect(page.getByTestId("receipt-po-ledger-header")).toBeVisible();
    await expect(page.getByTestId("receipt-po-ledger-po-chip")).toContainText("OPEN");

    // Door mode: the progress detail row starts collapsed for the operator
    // role, reachable via one disclosure toggle.
    const progressToggle = page.getByTestId("receipt-po-ledger-progress-toggle");
    await expect(progressToggle).toBeVisible();
    await expect(progressToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("receipt-po-ledger-progress-row")).toHaveCount(0);
    await progressToggle.click();
    await expect(page.getByTestId("receipt-po-ledger-progress-row")).toBeVisible();

    // Line prefilled to the full open qty (20) — edit it down to a short
    // receipt (12 of 20 open).
    const qtyInput = page.locator("#receipt-line-qty-0");
    await expect(qtyInput).toHaveValue("20");
    await qtyInput.fill("12");

    // Pre-submit short-marking visible before tapping submit.
    await expect(page.getByTestId("receipt-summary-short-receipt")).toContainText("1 short");
    const preSubmitSummary = page.getByTestId("receipt-short-receipt-summary");
    await expect(preSubmitSummary).toContainText("1 line short vs ordered");
    await expect(preSubmitSummary).toContainText("Short vs ordered: 8 KG — PO stays open for the rest.");

    // No over-receipt confirm gate for a short receipt — submits directly.
    await page.getByTestId("receipt-submit").click();

    const success = page.getByTestId("receipt-success-panel");
    await expect(success).toBeVisible();
    await expect(success).toContainText("Receipt posted successfully.");
    await expect(page.getByTestId("receipt-success-short-delta")).toContainText(
      "Short vs ordered: 8 KG — PO stays open for the rest.",
    );

    // The PO stays OPEN (not RECEIVED) when the receipt is short — the mocked
    // list endpoint still reports OPEN post-submit (server-truth is
    // untouched by this presentation-only tranche).
    await expect(page.getByTestId("receipt-po-ledger-po-chip")).toContainText("OPEN");
    await expect(page.getByTestId("receipt-po-ledger-po-chip")).not.toContainText("RECEIVED");
  });

  test("operator: manual (no-PO) track is still reachable from the picker", async ({ page }) => {
    await setFakeRole(page, "operator");
    await mockMasterData(page);

    await page.goto("/stock/receipts");
    await page.getByTestId("receipt-landing-manual-start").click();
    await expect(page.getByTestId("receipts-manual-context-strip")).toBeVisible();
  });
});
