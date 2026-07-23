// ---------------------------------------------------------------------------
// /home Today Board — Tranche 136.
//
// Tagged @mocked: stubs the five read endpoints the board pulls from
// (production-plan, production-actuals/history, credit-tracking,
// purchase-orders, inventory/flow, planning/demand-coverage) at the browser
// so the three-tab walk, the per-role gate, and the degraded-API honesty
// states are all verified WITHOUT a live backend. Mirrors
// receipts-door-mode.spec.ts's route-stub pattern.
// ---------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

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

const PLAN_ROWS = [
  {
    plan_id: "PLAN-NOREPORT",
    plan_type: "production",
    plan_date: YESTERDAY_ISO,
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
    created_at: `${YESTERDAY_ISO}T06:00:00Z`,
    updated_at: `${YESTERDAY_ISO}T06:00:00Z`,
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: null,
    completed_actual: null,
  },
  {
    plan_id: "PLAN-REPORTED",
    plan_type: "production",
    plan_date: YESTERDAY_ISO,
    item_id: "ITEM2",
    item_name: "Iced Tea",
    item_supply_method: "MANUFACTURED",
    planned_qty: "50",
    uom: "L",
    status: "completed",
    rendered_state: "done",
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
    created_at: `${YESTERDAY_ISO}T06:00:00Z`,
    updated_at: `${YESTERDAY_ISO}T06:00:00Z`,
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: "SUB1",
    completed_actual: null,
  },
  {
    plan_id: "PLAN-TODAY",
    plan_type: "production",
    plan_date: TODAY_ISO,
    item_id: "ITEM3",
    item_name: "Margarita Base",
    item_supply_method: "MANUFACTURED",
    planned_qty: "75",
    uom: "L",
    status: "in_production",
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
  },
];

const ACTUAL_ROWS = [
  {
    submission_id: "SUB1",
    item_id: "ITEM2",
    item_name: "Iced Tea",
    output_qty: "48",
    scrap_qty: "1",
    output_uom: "L",
    bom_version_label: "v1",
    event_at: `${YESTERDAY_ISO}T14:00:00Z`,
    posted_at: `${YESTERDAY_ISO}T14:00:00Z`,
    consumption_count: 3,
    variance_reason_code: null,
    variance_note: null,
    reversed: false,
    reversed_by_submission_id: null,
    reversed_at: null,
  },
];

const CREDIT_ROWS = [
  {
    credit_task_id: "CREDIT1",
    created_at: `${YESTERDAY_ISO}T09:00:00Z`,
    wp_order_id: "WP1",
    customer_name: "Acme Bar",
    item_id: "ITEM2",
    item_name: "Iced Tea",
    qty_ordered: 10,
    qty_picked: 7,
    qty_missing: 3,
    status: "PENDING",
    note: null,
    resolved_at: null,
    resolved_by_name: null,
  },
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

const FLOW_ITEMS = [
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
      { ...FLOW_DAY_BASE, day: TODAY_ISO, projected_on_hand_eod_with_production: 5, shortfall_qty: 0, shortfall_qty_with_production: 0 },
      { ...FLOW_DAY_BASE, day: TOMORROW_ISO, projected_on_hand_eod_with_production: -8, shortfall_qty: 8, shortfall_qty_with_production: 8 },
    ],
    weeks: [],
  },
  {
    item_id: "OK1",
    item_name: "Healthy Item",
    family: null,
    sku_kind: "ITEM",
    supply_method: "MANUFACTURED",
    risk_tier: "healthy",
    days_of_cover: 20,
    effective_lead_time_days: 3,
    current_on_hand: 500,
    earliest_stockout_date: null,
    days: [
      { ...FLOW_DAY_BASE, day: TODAY_ISO, projected_on_hand_eod_with_production: 500, shortfall_qty: 0, shortfall_qty_with_production: 0 },
      { ...FLOW_DAY_BASE, day: TOMORROW_ISO, projected_on_hand_eod_with_production: 480, shortfall_qty: 0, shortfall_qty_with_production: 0 },
    ],
    weeks: [],
  },
];

const FLOW_RESPONSE = {
  as_of: new Date().toISOString(),
  summary: {
    at_risk_count: 1,
    earliest_stockout: { date: TOMORROW_ISO, item_id: "SHORT1", item_name: "Shortage Item" },
    open_orders_count: 1,
    exceptions_count: 0,
    unknown_sku_pct_of_demand: 0,
  },
  items: FLOW_ITEMS,
};

const COVERAGE_RESPONSE = {
  as_of: new Date().toISOString(),
  total_lines: 20,
  resolved_lines: 16,
  bundle_lines: 0,
  unresolved_lines: 4,
  total_distinct_skus: 10,
  resolved_distinct_skus: 8,
  bundle_distinct_skus: 0,
  unresolved_distinct_skus: 2,
  is_partial: true,
};

async function mockBoardApis(page: Page) {
  await page.route("**/api/production-plan?**", (route) =>
    route.fulfill({ json: { rows: PLAN_ROWS, count: PLAN_ROWS.length, as_of: new Date().toISOString() } }),
  );
  await page.route("**/api/production-actuals/history**", (route) =>
    route.fulfill({ json: { rows: ACTUAL_ROWS, count: ACTUAL_ROWS.length } }),
  );
  await page.route("**/api/credit-tracking**", (route) =>
    route.fulfill({ json: { rows: CREDIT_ROWS, total: CREDIT_ROWS.length, pending_count: 1 } }),
  );
  await page.route("**/api/purchase-orders?status=OPEN&status=PARTIAL**", (route) =>
    route.fulfill({ json: { rows: PO_ROWS, count: PO_ROWS.length } }),
  );
  await page.route("**/api/inventory/flow**", (route) => route.fulfill({ json: FLOW_RESPONSE }));
  await page.route("**/api/planning/demand-coverage**", (route) =>
    route.fulfill({ json: COVERAGE_RESPONSE }),
  );
}

test.describe("@mocked /home Today Board", () => {
  for (const role of ["operator", "planner", "admin"] as const) {
    test(`${role}: board renders and the three tabs walk`, async ({ page }) => {
      await setFakeRole(page, role);
      await mockBoardApis(page);
      await page.goto("/home");

      const board = page.getByTestId("today-board");
      await expect(board).toBeVisible();

      // Default tab is Today.
      await expect(page.getByTestId("today-board-panel-today")).toBeVisible();
      await expect(page.getByTestId("today-board-panel-today")).toContainText("Margarita Base");
      await expect(page.getByTestId("today-board-panel-today")).toContainText("PO-0001");

      // Yesterday tab — no-report flag leads, reported row also present.
      await page.getByRole("tab", { name: "Yesterday" }).click();
      await expect(page).toHaveURL(/tab=yesterday/);
      const yesterdayPanel = page.getByTestId("today-board-panel-yesterday");
      await expect(yesterdayPanel).toBeVisible();
      await expect(yesterdayPanel.getByText("No report entered")).toBeVisible();
      await expect(yesterdayPanel).toContainText("Mojito Mix");
      await expect(yesterdayPanel).toContainText("Iced Tea");
      await expect(yesterdayPanel).toContainText("shortage");

      // Tomorrow tab — the short item leads.
      await page.getByRole("tab", { name: "Tomorrow" }).click();
      await expect(page).toHaveURL(/tab=tomorrow/);
      const tomorrowPanel = page.getByTestId("today-board-panel-tomorrow");
      await expect(tomorrowPanel).toBeVisible();
      await expect(tomorrowPanel.getByText("Shortage Item")).toBeVisible();
      await expect(tomorrowPanel.getByText("Short", { exact: true }).first()).toBeVisible();

      // Back to Today via keyboard (roving tabindex Home key).
      await page.getByRole("tab", { name: "Tomorrow" }).press("Home");
      await expect(page).toHaveURL(/tab=yesterday/);
    });
  }

  test("viewer: board does not render, cockpit unchanged", async ({ page }) => {
    await setFakeRole(page, "viewer");
    await mockBoardApis(page);
    await page.goto("/home");

    await expect(page.getByTestId("home-cockpit")).toBeVisible();
    await expect(page.getByTestId("today-board")).toHaveCount(0);
  });

  test("degraded API: a 500 on inventory/flow shows an honest unavailable note, not a crash or a fake tier", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await mockBoardApis(page);
    await page.unroute("**/api/inventory/flow**");
    await page.route("**/api/inventory/flow**", (route) =>
      route.fulfill({ status: 500, json: { error: "boom" } }),
    );

    await page.goto("/home?tab=tomorrow");
    const panel = page.getByTestId("today-board-panel-tomorrow");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Inventory flow couldn't be loaded right now.")).toBeVisible();
    await expect(panel.getByText("Shortage Item")).toHaveCount(0);
  });

  test("degraded API: an empty purchase-orders response shows an honest empty state on Today", async ({
    page,
  }) => {
    await setFakeRole(page, "operator");
    await mockBoardApis(page);
    await page.unroute("**/api/purchase-orders?status=OPEN&status=PARTIAL**");
    await page.route("**/api/purchase-orders?status=OPEN&status=PARTIAL**", (route) =>
      route.fulfill({ json: { rows: [], count: 0 } }),
    );

    await page.goto("/home?tab=today");
    const panel = page.getByTestId("today-board-panel-today");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("No supplier arrivals expected today.")).toBeVisible();
  });

  test("degraded API: production-plan 404 shows an honest unavailable note on Yesterday, not a crash", async ({
    page,
  }) => {
    await setFakeRole(page, "admin");
    await mockBoardApis(page);
    await page.unroute("**/api/production-plan?**");
    await page.route("**/api/production-plan?**", (route) => route.fulfill({ status: 404, json: {} }));

    await page.goto("/home?tab=yesterday");
    const panel = page.getByTestId("today-board-panel-yesterday");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Yesterday's production plan couldn't be loaded right now."),
    ).toBeVisible();
  });
});
