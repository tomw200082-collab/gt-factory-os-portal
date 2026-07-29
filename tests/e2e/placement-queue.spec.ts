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
    scheduled_order_date: "2026-07-10",
    latest_safe_order_date: "2026-07-10",
    planned_receive_date: "2026-07-17",
    as_of_date: "2026-07-29",
    due_state: "overdue",
    risk_state: "ok",
    priority_bucket: 1,
    line_count: 1,
    total_ordered_qty: "10",
    total_received_qty: "0",
    total_open_qty: "10",
    updated_at: "2026-07-29T08:00:00Z",
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
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
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

  test("INTER-005: a blank confirmed date blocks submit with a clear ETA tooltip", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
      route.fulfill({ json: { rows: [po({ expected_receive_date: null })], count: 1 } }),
    );
    await page.route("**/api/purchase-order-lines**", (route) =>
      route.fulfill({ json: { rows: [LINE] } }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await page.getByTestId("placement-row-toggle-PO1").click();
    await page.getByTestId("placement-price-L1").fill("12.5");
    await page.getByTestId("placement-terms-PO1").selectOption({ index: 1 });

    // Clear the (empty-by-default here) ETA field explicitly: the redesigned
    // flow blocks placement until the supplier-confirmed ETA is present, so
    // there is no ambiguous "place anyway" dialog.
    await page.getByTestId("placement-eta-PO1").fill("");
    const submit = page.getByTestId("placement-submit-PO1");
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("title", /תאריך אספקה/);

    await page.getByTestId("placement-eta-PO1").fill("2026-08-03");
    await expect(submit).toBeEnabled();
  });

  test("FLOW-004: empty queue shows the upstream-honesty line", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
      route.fulfill({ json: { rows: [], count: 0 } }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await expect(page.getByTestId("placement-queue-empty")).toBeVisible();
    await expect(page.getByText(/פנו למנהל התכנון/)).toBeVisible();
  });

  test("FLOW-006: an overdue order shows the aging banner", async ({ page }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
      route.fulfill({
        json: {
          rows: [
            po({
              po_id: "PO1",
              po_number: "PO-1",
              scheduled_order_date: "2020-01-01",
              latest_safe_order_date: "2020-01-01",
              due_state: "overdue",
              priority_bucket: 1,
              order_by_date: "2020-01-01",
            }),
            po({
              po_id: "PO2",
              po_number: "PO-2",
              scheduled_order_date: "2099-01-01",
              latest_safe_order_date: "2099-01-01",
              due_state: "later",
              priority_bucket: 4,
              order_by_date: "2099-01-01",
            }),
          ],
          count: 2,
        },
      }),
    );

    await page.goto("/purchase-orders/placement-queue");
    const banner = page.getByTestId("placement-queue-overdue-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("2 הזמנות ממתינות");
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
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
      route.fulfill({ json: {} }),
    );

    await page.goto("/purchase-orders/placement-queue");
    await expect(page.getByTestId("placement-queue-empty")).toBeVisible();
    await expect(
      page.getByText(/Cannot read properties of undefined/i),
    ).toHaveCount(0);
  });
  // -------------------------------------------------------------------------
  // Tranche 150 — partial placement end to end (backend 0298)
  // -------------------------------------------------------------------------
  const LINE2 = {
    ...LINE,
    po_line_id: "L2",
    line_number: 2,
    component_name: "רכיב שני",
    component_id: "C2",
    ordered_qty: "4",
  };

  test("tranche 150: places only what the supplier confirmed and splits the rest onto a sibling PO", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await page.route("**/api/purchase-orders/placement-queue**", (route) =>
      route.fulfill({ json: { rows: [po()], count: 1 } }),
    );
    await page.route("**/api/purchase-order-lines**", (route) =>
      route.fulfill({ json: { rows: [LINE, LINE2] } }),
    );

    let placeBody: any = null;
    await page.route("**/api/purchase-orders/*/place", async (route) => {
      placeBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        json: {
          po_id: "PO1",
          po_number: "PO-2026-00001",
          status: "OPEN",
          split_po_id: "PO-2026-00099",
          lines: [],
        },
      });
    });

    await page.goto("/purchase-orders/placement-queue");
    await page.getByTestId("placement-row-toggle-PO1").click();

    await page.getByTestId("placement-price-L1").fill("12.5");
    await page.getByTestId("placement-price-L2").fill("30");
    await page.getByTestId("placement-terms-PO1").selectOption({ index: 1 });

    const submit = page.getByTestId("placement-submit-PO1");
    await expect(submit).toBeEnabled();
    // Nothing marked yet → a full placement, no split panel.
    await expect(page.getByTestId("placement-split-panel")).toHaveCount(0);

    // Supplier had 6 of the 10 on line 1, and none of line 2.
    await page.getByTestId("placement-supply-partial-L1").click();
    await page.getByTestId("placement-supplied-L1").fill("6");
    await page.getByTestId("placement-supply-none-L2").click();

    // Split panel appears and the action is blocked until a reason is given.
    await expect(page.getByTestId("placement-split-panel")).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("title", /סיבה/);

    await page
      .getByTestId("placement-split-reason")
      .selectOption("אין במלאי אצל הספק");
    await expect(submit).toBeEnabled();
    await expect(submit).toContainText("בצע חלקית");

    await submit.click();

    // The confirm must itemise both sides — DR-019's P0 was hiding exactly this.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("מבוצע כעת");
    await expect(dialog).toContainText("לא סופק");
    await expect(dialog).toContainText("אין במלאי אצל הספק");
    await dialog.getByRole("button", { name: "בצע חלקית" }).click();

    // Payload: only the unsupplied amounts, plus the reason.
    await expect(page.getByTestId("placement-queue-success-split")).toBeVisible();
    expect(placeBody.split_reason).toBe("אין במלאי אצל הספק");
    expect(placeBody.unplaced_lines).toEqual([
      { po_line_id: "L1", unplaced_qty: 4 },
      { po_line_id: "L2", unplaced_qty: 4 },
    ]);

    // And the banner names the sibling order so the remainder is never lost.
    await expect(
      page.getByTestId("placement-queue-success-split-link"),
    ).toContainText("PO-2026-00099");
  });
});
