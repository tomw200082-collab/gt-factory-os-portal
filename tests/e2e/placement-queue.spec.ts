// ---------------------------------------------------------------------------
// Placement queue — DR-018 Tranche 124 (hebrew-surfaces-precision).
//
// Tagged @mocked RTL: stubs GET /api/purchase-orders (queue) + GET
// /api/purchase-order-lines at the browser so the price/term guard, the
// missing-ETA confirm warning, the empty-state honesty line, and the
// overdue banner are all verified WITHOUT a live backend.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

function po(overrides: Record<string, unknown> = {}) {
  return {
    po_id: "PO1",
    po_number: "PO-2026-00001",
    supplier_id: "SUP1",
    supplier_name: "ספק בדיקה",
    status: "APPROVED_TO_ORDER",
    expected_receive_date: null,
    currency: "ILS",
    total_net: "125.00",
    order_by_date: "2026-07-10",
    tier: "must",
    order_document_text: null,
    ...overrides,
  };
}

const LINE = {
  po_line_id: "L1",
  line_number: 1,
  component_name: "רכיב בדיקה",
  item_name: null,
  component_id: "C1",
  item_id: null,
  ordered_qty: "10",
  uom: "UNIT",
  line_status: "OPEN",
  unit_price_net: null,
};

test.describe("@mocked placement queue", () => {
  test("INTER-003: submit stays disabled with a tooltip until price + term are set", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders?status=APPROVED_TO_ORDER**", (route) =>
      route.fulfill({ json: { rows: [po()], count: 1 } }),
    );
    await page.route("**/api/purchase-order-lines**", (route) =>
      route.fulfill({ json: { rows: [LINE] } }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await page.getByTestId("placement-row-toggle-PO1").click();

    const submit = page.getByTestId("placement-submit-PO1");
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("title", /מחיר/);

    // Price only — still disabled (no term).
    await page.getByTestId("placement-price-L1").fill("12.5");
    await expect(submit).toBeDisabled();

    // Term only too → enabled.
    await page.getByTestId("placement-terms-PO1").selectOption({ index: 1 });
    await expect(submit).toBeEnabled();
  });

  test("INTER-005: a blank confirmed date adds an ETA warning to the confirm dialog", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders?status=APPROVED_TO_ORDER**", (route) =>
      route.fulfill({ json: { rows: [po({ expected_receive_date: null })], count: 1 } }),
    );
    await page.route("**/api/purchase-order-lines**", (route) =>
      route.fulfill({ json: { rows: [LINE] } }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await page.getByTestId("placement-row-toggle-PO1").click();
    await page.getByTestId("placement-price-L1").fill("12.5");
    await page.getByTestId("placement-terms-PO1").selectOption({ index: 1 });

    // Clear the (empty-by-default here) ETA field explicitly, then submit.
    await page.getByTestId("placement-eta-PO1").fill("");
    await page.getByTestId("placement-submit-PO1").click();

    await expect(page.getByText(/לא הוזן תאריך אספקה/)).toBeVisible();
  });

  test("FLOW-004: empty queue shows the upstream-honesty line", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders?status=APPROVED_TO_ORDER**", (route) =>
      route.fulfill({ json: { rows: [], count: 0 } }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await expect(page.getByTestId("placement-queue-empty")).toBeVisible();
    await expect(page.getByText(/פנו למנהל התכנון/)).toBeVisible();
  });

  test("FLOW-006: an overdue order shows the aging banner", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders?status=APPROVED_TO_ORDER**", (route) =>
      route.fulfill({
        json: {
          rows: [
            po({ po_id: "PO1", po_number: "PO-1", order_by_date: "2020-01-01" }),
            po({ po_id: "PO2", po_number: "PO-2", order_by_date: "2099-01-01" }),
          ],
          count: 2,
        },
      }),
    );

    await page.goto("/purchase-orders/placement-queue");
    const banner = page.getByTestId("placement-queue-overdue-banner");
    await expect(banner).toBeVisible();
    // ux-release-gate 2026-07-23 COPY-020 (tranche 140 round 1): "ממתינות"
    // (waiting) → "בתור" (in queue) — this assertion was never updated to
    // match, caught by CI on tranche 140's closing PR.
    await expect(banner).toContainText("2 הזמנות בתור");
    await expect(banner).toContainText("1 באיחור");
  });

  test("DR-018 ux-release-gate: a malformed 200 response (no rows field) never shows raw JS error text", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");

    // Regression guard for a real bug the release gate found: `data.rows.sort()`
    // had no null guard, so a malformed 200 threw "Cannot read properties of
    // undefined (reading 'sort')" — and that raw English message rendered
    // verbatim on this Hebrew-only bookkeeper surface. The guarded queryFn now
    // treats a missing `rows` field as an empty list, so the page degrades to
    // its normal empty state instead of crashing.
    await page.route("**/api/purchase-orders?status=APPROVED_TO_ORDER**", (route) =>
      route.fulfill({ json: {} }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await expect(page.getByTestId("placement-queue-empty")).toBeVisible();
    await expect(
      page.getByText(/Cannot read properties of undefined/i),
    ).toHaveCount(0);
  });
});
