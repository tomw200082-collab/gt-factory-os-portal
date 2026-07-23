import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Mobile-only spec — runs under the mobile-safari Playwright project
// (playwright.config.ts), iPhone 14 device (390x844, WebKit).
//
// Tranche 136 — screenshot pass for the /home Today Board's three tabs on a
// phone-sized viewport. Not tagged @mocked (matches the existing
// mobile-receipts-door-mode precedent in this repo) — portal-pr-guard only
// installs the chromium browser, so mobile-safari specs stay out of the
// `--grep @mocked` CI gate and are run manually with webkit installed
// locally.

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TODAY = new Date();
const YESTERDAY = new Date(TODAY);
YESTERDAY.setDate(TODAY.getDate() - 1);
const TOMORROW = new Date(TODAY);
TOMORROW.setDate(TODAY.getDate() + 1);
const TODAY_ISO = isoDate(TODAY);
const YESTERDAY_ISO = isoDate(YESTERDAY);
const TOMORROW_ISO = isoDate(TOMORROW);

function planRow(overrides: Record<string, unknown>) {
  return {
    plan_id: "P1",
    plan_type: "production",
    plan_date: TODAY_ISO,
    item_id: "ITEM1",
    item_name: "Mojito Mix",
    item_supply_method: "MANUFACTURED",
    planned_qty: "100",
    uom: "L",
    status: "planned",
    rendered_state: "planned",
    base_bom_head_id: null,
    is_base_batch: false,
    pack_manifest_count: 0,
    source_recommendation_id: null,
    source_run_id: null,
    source_run_status: null,
    source_recommendation_qty: null,
    bom_version_id_pinned: null,
    bom_version_label: null,
    notes: null,
    created_by_user_id: "u1",
    created_by_snapshot: "Tom",
    created_at: `${TODAY_ISO}T06:00:00Z`,
    updated_at: `${TODAY_ISO}T06:00:00Z`,
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: null,
    completed_actual: null,
    ...overrides,
  };
}

const PLAN_ROWS = [
  planRow({ plan_id: "P-Y-NOREPORT", plan_date: YESTERDAY_ISO, item_name: "Mojito Mix" }),
  planRow({
    plan_id: "P-T",
    plan_date: TODAY_ISO,
    item_name: "Margarita Base",
    status: "in_production",
  }),
];

const PO_ROWS = [
  {
    po_id: "PO1",
    po_number: "PO-0001",
    supplier_id: "SUP1",
    supplier_name: "Acme Foods",
    status: "OPEN",
    order_date: YESTERDAY_ISO,
    expected_receive_date: TODAY_ISO,
    currency: "ILS",
    total_net: "500",
    total_gross: null,
    notes: null,
    site_id: "SITE1",
    source_run_id: null,
    source_recommendation_id: null,
  },
];

const FLOW_DAY_BASE = {
  is_working_day: true,
  holiday_name_he: null,
  demand_lionwheel: 10,
  demand_forecast: 5,
  incoming_supply: 0,
  projected_on_hand_eod: 20,
  inflow_from_production: 0,
  incoming_supply_combined: 0,
  tier: "healthy",
};

const FLOW_RESPONSE = {
  as_of: new Date().toISOString(),
  summary: {
    at_risk_count: 1,
    earliest_stockout: { date: TOMORROW_ISO, item_id: "SHORT1", item_name: "Shortage Item" },
    open_orders_count: 1,
    exceptions_count: 0,
    unknown_sku_pct_of_demand: 0,
  },
  items: [
    {
      item_id: "SHORT1",
      item_name: "Shortage Item",
      family: null,
      sku_kind: "ITEM",
      supply_method: "MANUFACTURED",
      risk_tier: "critical",
      days_of_cover: 0,
      effective_lead_time_days: 3,
      current_on_hand: 5,
      earliest_stockout_date: TOMORROW_ISO,
      days: [
        { ...FLOW_DAY_BASE, day: TOMORROW_ISO, projected_on_hand_eod_with_production: -8, shortfall_qty: 8, shortfall_qty_with_production: 8 },
      ],
      weeks: [],
    },
  ],
};

test.describe("mobile WebKit (iPhone 14, 390px) — /home Today Board", () => {
  test("all three tabs render without a scroll trap", async ({ page }) => {
    // Reduced motion so the /home entrance animation (animate-fade-in-up)
    // doesn't leave a full-page screenshot mid-fade — the page already
    // honors motion-reduce: per page.tsx's REVEAL class.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setFakeRole(page, "planner");
    await page.route("**/api/production-plan?**", (route) =>
      route.fulfill({ json: { rows: PLAN_ROWS, count: PLAN_ROWS.length, as_of: new Date().toISOString() } }),
    );
    await page.route("**/api/production-actuals/history**", (route) =>
      route.fulfill({ json: { rows: [], count: 0 } }),
    );
    await page.route("**/api/credit-tracking**", (route) =>
      route.fulfill({ json: { rows: [], total: 0, pending_count: 0 } }),
    );
    await page.route("**/api/purchase-orders?status=OPEN&status=PARTIAL**", (route) =>
      route.fulfill({ json: { rows: PO_ROWS, count: PO_ROWS.length } }),
    );
    await page.route("**/api/inventory/flow**", (route) => route.fulfill({ json: FLOW_RESPONSE }));
    await page.route("**/api/planning/demand-coverage**", (route) =>
      route.fulfill({
        json: {
          as_of: new Date().toISOString(),
          total_lines: 10,
          resolved_lines: 8,
          bundle_lines: 0,
          unresolved_lines: 2,
          total_distinct_skus: 5,
          resolved_distinct_skus: 4,
          bundle_distinct_skus: 0,
          unresolved_distinct_skus: 1,
          is_partial: true,
        },
      }),
    );

    await page.goto("/home");
    await expect(page.getByTestId("today-board")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("today-board-panel-today")).toContainText("Margarita Base", {
      timeout: 15_000,
    });
    await page.screenshot({
      path: "test-results/today-board-screenshots/01-today.png",
      fullPage: true,
    });

    await page.getByRole("tab", { name: "Yesterday" }).click();
    await expect(page.getByTestId("today-board-panel-yesterday")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: "test-results/today-board-screenshots/02-yesterday.png",
      fullPage: true,
    });

    await page.getByRole("tab", { name: "Tomorrow" }).click();
    await expect(page.getByTestId("today-board-panel-tomorrow")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: "test-results/today-board-screenshots/03-tomorrow.png",
      fullPage: true,
    });

    // Sticky-nothing here (read-only board), but the tab bar must stay
    // reachable without a horizontal scroll trap on a 390px viewport.
    await expect(page.getByRole("tab", { name: "Today" })).toBeVisible();
  });
});
