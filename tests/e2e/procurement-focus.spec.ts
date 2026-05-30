// ---------------------------------------------------------------------------
// Procurement focus-mode — deterministic end-to-end walk-through (Tranche 036).
//
// Tagged @mocked: it stubs the purchase-session API at the browser (page.route)
// so the approve → place → auto-advance → done loop is verified WITHOUT a live
// backend. This is the CI-runnable proof of the focus close loop; a live-backend
// smoke still belongs to a real environment.
// ---------------------------------------------------------------------------

import { test, expect } from "@playwright/test";
import { setFakeRole } from "./helpers";

test.describe("@mocked procurement focus mode", () => {
  test("approve → place → creates PO → completion", async ({ page }) => {
    await setFakeRole(page, "planner");

    // Mutable session state the stubs evolve as the planner acts.
    let status: "proposed" | "approved" | "placed" = "proposed";
    let orderDoc: string | null = null;
    let poId: string | null = null;

    const po = () => ({
      session_po_id: "PO1",
      supplier_id: "SUP1",
      supplier_snapshot: "ספק בדיקה",
      tier: "must",
      status,
      order_by_date: "2026-05-20",
      earliest_need_date: "2026-06-01",
      covered_through_date: null,
      currency: "ILS",
      total_cost: 100,
      order_document_text: orderDoc,
      po_id: poId,
      blocking_issues: [],
      lines: [
        {
          session_po_line_id: "L1",
          component_id: "C1",
          item_id: null,
          line_label: "רכיב בדיקה",
          recommended_qty: 10,
          final_qty: 10,
          uom: "UNIT",
          unit_cost: 10,
          line_cost: 100,
          earliest_need_date: null,
          coverage_trace: null,
          is_user_added: false,
          is_dropped: false,
        },
      ],
    });

    const session = () => ({
      session: {
        session_id: "S1",
        session_type: "weekly",
        session_date: "2026-05-31",
        status: "open",
        horizon_days: 14,
        consolidation_window_days: 7,
        rebuild_verifier_drift: null,
        warnings: [],
        release_fence: null,
        created_at: "2026-05-31T00:00:00Z",
        completed_at: null,
        totals: {
          po_count: 1,
          line_count: 1,
          total_cost: 100,
          by_tier: { urgent: 0, must: 1, recommended: 0 },
          by_status: {
            proposed: status === "proposed" ? 1 : 0,
            approved: status === "approved" ? 1 : 0,
            placed: status === "placed" ? 1 : 0,
            skipped: 0,
          },
        },
        pos: [po()],
      },
    });

    await page.route("**/api/purchase-session/current", (route) =>
      route.fulfill({ json: session() }),
    );
    await page.route("**/api/purchase-session/po/*/approve", (route) => {
      status = "approved";
      orderDoc = "שלום, נא לספק את הפריטים הבאים…";
      return route.fulfill({ json: { po: po() } });
    });
    await page.route("**/api/purchase-session/po/*/place", (route) => {
      status = "placed";
      poId = "po_created_abcdef12";
      return route.fulfill({ json: { po: po() } });
    });

    await page.goto("/planning/procurement");

    // The decision-ordered action list shows the proposed order.
    await expect(page.getByTestId("procurement-row-PO1")).toBeVisible();

    // Enter focus mode.
    await page.getByTestId("procurement-start-focus").click();
    await expect(page.getByTestId("focus-mode")).toBeVisible();
    await expect(page.getByTestId("focus-card-PO1")).toBeVisible();

    // Approve → the order document + the place control appear.
    await page.getByTestId("focus-approve").click();
    await expect(page.getByTestId("focus-place")).toBeVisible();
    await expect(page.getByTestId("focus-copy-doc")).toBeVisible();

    // Place → creates the PO; with no other orders left, the completion
    // (all-placed) screen appears.
    await page.getByTestId("focus-place").click();
    await expect(page.getByTestId("focus-done")).toBeVisible();
    await expect(page.getByTestId("focus-done-close")).toBeVisible();
  });
});
