// ---------------------------------------------------------------------------
// Dashboard Bands 0–2 — deterministic e2e (Tranche 060).
//
// Tagged @mocked: stubs every dashboard API at the browser (page.route) so
// the Verdict band (Focus Engine), Factory Flow Ribbon, and Today's Work
// queue are verified WITHOUT a live backend — same pattern as
// procurement-focus.spec.ts.
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

const TODAY = new Date();
const todayISO = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-${String(
  TODAY.getDate(),
).padStart(2, "0")}`;

async function mockDashboardApis(
  page: Page,
  opts: { critical?: boolean; slipped?: boolean } = {},
) {
  // Generic fallback first — Playwright matches routes in reverse
  // registration order, so the specific stubs below win.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/system/break-glass", (route) =>
    route.fulfill({
      json: { break_glass_active: false, jobs_paused: false, set_at: null },
    }),
  );
  // FG projection (products universe).
  await page.route("**/api/inventory/flow**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            item_id: "FG1",
            item_name: "Mojito 330ml",
            risk_tier: "watch",
            days_of_cover: 6.5,
            current_on_hand: 320,
          },
          {
            item_id: "FG2",
            item_name: "Margarita 330ml",
            risk_tier: "healthy",
            days_of_cover: 18,
            current_on_hand: 900,
          },
        ],
      },
    }),
  );
  // Supply flow (RM/PKG components universe) — feeds the MATERIALS node.
  await page.route("**/api/inventory/supply-flow**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            item_id: "RM1",
            item_name: "Lime juice",
            risk_tier: "critical",
            days_of_cover: 1.4,
            current_on_hand: 40,
          },
          {
            item_id: "RM2",
            item_name: "Cane sugar",
            risk_tier: "healthy",
            days_of_cover: 21,
            current_on_hand: 900,
          },
        ],
      },
    }),
  );
  await page.route("**/api/stock/value", (route) =>
    route.fulfill({
      json: {
        as_of: new Date().toISOString(),
        total_value_ils: "100000",
        by_type: [
          {
            item_type: "RM",
            value_ils: "60000",
            priced_sku_count: 10,
            unpriced_sku_count: 0,
            total_sku_count: 10,
          },
          {
            item_type: "FG",
            value_ils: "40000",
            priced_sku_count: 5,
            unpriced_sku_count: 0,
            total_sku_count: 5,
          },
        ],
      },
    }),
  );
  await page.route("**/api/exceptions**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/planning/runs**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/production-plan**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            item_id: "FG1",
            item_name: "Mojito 330ml",
            plan_date: todayISO,
            planned_qty: 100,
            completed_qty: 0,
            status: "PLANNED",
          },
        ],
      },
    }),
  );
  await page.route("**/api/production-actuals/history**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/stock/ledger**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/purchase-orders**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            po_id: "P1",
            po_number: "PO-100",
            supplier_name: "Tempo",
            status: "OPEN",
            expected_receive_date: "2026-01-01", // long past — always late
            currency: "ILS",
            total_net: "1200",
          },
        ],
      },
    }),
  );
  await page.route("**/api/purchase-session/current", (route) =>
    route.fulfill({ json: { session: null } }),
  );
  await page.route("**/api/economics/raw-materials", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.route("**/api/orders/outbound-summary", (route) =>
    route.fulfill({
      json: { open_orders: 5, due_today: 2, as_of: new Date().toISOString() },
    }),
  );
  await page.route("**/api/dashboard/critical-today", (route) =>
    route.fulfill({
      json: {
        as_of: new Date().toISOString(),
        rows: opts.critical
          ? [
              {
                trigger_kind: "stockout",
                display_name: "Lime juice stockout",
                severity: "critical",
                triggered_at: new Date().toISOString(),
                detail_jsonb: { item_id: "RM1" },
              },
            ]
          : [],
      },
    }),
  );
  await page.route("**/api/dashboard/slipped-plans", (route) =>
    route.fulfill({
      json: {
        as_of: new Date().toISOString(),
        window_days: 7,
        rows: opts.slipped
          ? [
              {
                plan_id: "SP1",
                plan_date: "2026-06-08",
                item_id: "FG1",
                item_name: "Mojito 330ml",
                planned_qty: "50",
                uom: "UNIT",
                source_recommendation_id: null,
                slipped_at: "2026-06-09T06:00:00Z",
                updated_at: "2026-06-09T06:00:00Z",
                days_overdue: 3,
              },
            ]
          : [],
      },
    }),
  );
}

test.describe("@mocked dashboard bands 0–2", () => {
  test("critical day: focus names the blocker; queue ranks critical first", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await mockDashboardApis(page, { critical: true, slipped: true });
    await page.goto("/dashboard");

    // Band 0 — verdict + Focus Engine sentence (rule 1).
    await expect(page.getByTestId("dash-verdict")).toBeVisible();
    await expect(page.getByTestId("dash-focus")).toContainText(
      "Lime juice stockout stops production today",
    );
    await expect(page.getByTestId("dash-state-pill")).toContainText("1 critical");

    // Band 1 — all five ribbon stages render; quiet OUTBOUND has no link.
    for (const key of ["inbound", "materials", "production", "fg", "outbound"]) {
      await expect(page.getByTestId(`flow-node-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId("flow-node-materials")).toHaveAttribute(
      "href",
      "/planning/inventory-flow/supply",
    );
    // Truth fix (Tranche 064): MATERIALS reads the components universe and
    // names the worst item inline; FG reflects product risk.
    await expect(page.getByTestId("flow-node-materials")).toContainText("Lime juice: 1.4d");
    await expect(page.getByTestId("flow-node-fg")).toHaveAttribute("data-state", "warn");
    // FLOW-E01: the pill is a workload meter.
    await expect(page.getByTestId("dash-state-pill")).toContainText("actions today");
    // FLOW-D01 + FLOW-E02: the working instruction shows for a first-time
    // user, and is dismissible (stays dismissed).
    await expect(page.getByTestId("todays-work-hint")).toContainText("Start at the top");
    await page.getByTestId("todays-work-hint-dismiss").click();
    await expect(page.getByTestId("todays-work-hint")).toHaveCount(0);
    // Tranche 063: OUTBOUND is live from the LionWheel mirror summary.
    await expect(page.getByTestId("flow-node-outbound")).toContainText("5");
    await expect(page.getByTestId("flow-node-outbound")).toContainText("2 due today");
    // FLOW-D04: the focus sentence is marked as the daily directive.
    await expect(page.getByTestId("dash-focus-eyebrow")).toContainText("Today's focus");

    // Band 2 — queue: critical stockout row outranks the slipped + late-PO
    // rows, and every row carries a transaction CTA.
    const rows = page.getByTestId("todays-work-list").locator("li");
    await expect(rows.first()).toHaveAttribute("data-severity", "critical");
    await expect(rows.first()).toContainText("Resolve: Lime juice stockout");
    await expect(
      page.getByTestId("todays-work-list").getByRole("link", { name: /Open plan/ }),
    ).toBeVisible();
    await expect(
      page.getByTestId("todays-work-list").getByRole("link", { name: /Open PO/ }),
    ).toBeVisible();
  });

  test("clear day: focus advances to today's plan; queue shows late PO only", async ({
    page,
  }) => {
    await setFakeRole(page, "planner");
    await mockDashboardApis(page);
    await page.goto("/dashboard");

    // No criticals, no slipped, no session → rule 5 (today's plan) wins
    // (rule 2 procurement-day only fires on Sunday — plan rows exist daily
    // here). Retrying matcher waits out the "Reading the floor state…" rule-0
    // window while queries resolve.
    const focus = page.getByTestId("dash-focus");
    if (TODAY.getDay() === 0) {
      // Sunday runs of this suite legitimately resolve to procurement-day.
      await expect(focus).toContainText(/Procurement day|planned today/);
    } else {
      await expect(focus).toContainText("planned today");
      await expect(focus).toContainText("Mojito 330ml");
    }

    // Late PO from the mock still queues work.
    const rows = page.getByTestId("todays-work-list").locator("li");
    await expect(rows.first()).toContainText("Chase receipt: PO PO-100");

    // Band 3 (Tranche 061) — the Week panel answers the money questions.
    await expect(page.getByTestId("week-procurement")).toBeVisible();
    await expect(page.getByTestId("week-procurement")).toContainText("Procurement this week");
    await expect(page.getByTestId("week-procurement")).toContainText("Awaiting receipt");
    await expect(page.getByTestId("week-production")).toBeVisible();
  });

  test("viewer sees the digest only — no Today's Work, no Numbers band", async ({
    page,
  }) => {
    await setFakeRole(page, "viewer");
    await mockDashboardApis(page);
    await page.goto("/dashboard");

    await expect(page.getByTestId("dash-verdict")).toBeVisible();
    await expect(page.getByTestId("flow-ribbon")).toBeVisible();
    await expect(page.getByTestId("todays-work-list")).toHaveCount(0);
    await expect(page.getByTestId("week-panel")).toHaveCount(0);
  });
});
