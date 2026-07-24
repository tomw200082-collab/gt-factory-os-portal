// ---------------------------------------------------------------------------
// Tranche 141 — production order picking (@mocked).
//
// Stubs the production-runs endpoints at the browser so the ordered run list,
// the stage-aware picking screen, tap-confirm + inline edit, the "Done
// collecting" resolve-gate, and the unplanned-run dialog are all verified
// WITHOUT a live backend.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

function todayRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "RUN1",
    plan_id: "PLAN1",
    stage: "TANK",
    item_id: "ITEM1",
    item_name: "Base mix",
    base_bom_head_id: null,
    target_qty: "200",
    uom: "L",
    status: "PLANNED",
    unplanned: false,
    order_index: 0,
    ...overrides,
  };
}

const PICK_LIST = {
  run_id: "RUN1",
  plan_id: "PLAN1",
  stage: "TANK",
  item_id: "ITEM1",
  item_name: "Base mix",
  target_qty: "200",
  uom: "L",
  status: "PLANNED",
  pack_bom_version_id: null,
  base_bom_version_id: "BBV1",
  lines: [
    {
      component_id: "C1",
      component_name: "Sugar",
      source: "base",
      item_type: "RM",
      required_qty: "14",
      uom: "kg",
      on_hand: "50",
    },
    {
      component_id: "C2",
      component_name: "Lemon juice",
      source: "base",
      item_type: "RM",
      required_qty: "8",
      uom: "L",
      on_hand: "20",
    },
  ],
};

async function stubToday(page: import("@playwright/test").Page, rows: unknown[]) {
  await page.route("**/api/production-runs/today**", (route) =>
    route.fulfill({ json: { date: "2026-07-24", count: rows.length, rows } }),
  );
}

test.describe("@mocked production picking", () => {
  test("today's runs render in work order (step 1 · 2 · 3)", async ({ page }) => {
    await setFakeRole(page, "operator");
    await stubToday(page, [
      todayRow({ run_id: "RUN_B", item_name: "Fill A", stage: "PACK", order_index: 1 }),
      todayRow({ run_id: "RUN_A", item_name: "Make tank", stage: "TANK", order_index: 0 }),
      todayRow({ run_id: "RUN_C", item_name: "Fill B", stage: "PACK", order_index: 2 }),
    ]);

    await page.goto("/production");
    const cards = page.getByTestId("run-list").locator('[data-testid^="run-card-"]');
    await expect(cards).toHaveCount(3);
    // Sorted by order_index → RUN_A, RUN_B, RUN_C regardless of response order.
    await expect(cards.nth(0)).toHaveAttribute("data-testid", "run-card-RUN_A");
    await expect(cards.nth(1)).toHaveAttribute("data-testid", "run-card-RUN_B");
    await expect(cards.nth(2)).toHaveAttribute("data-testid", "run-card-RUN_C");
  });

  test("empty state invites an extra run", async ({ page }) => {
    await setFakeRole(page, "operator");
    await stubToday(page, []);
    await page.goto("/production");
    await expect(page.getByTestId("production-today-empty")).toBeVisible();
    await expect(page.getByText("No production today.")).toBeVisible();
  });

  test("open a run → pick rows show the prefilled required quantity", async ({ page }) => {
    await setFakeRole(page, "operator");
    await stubToday(page, [todayRow()]);
    await page.route("**/api/production-runs/*/pick-list", (route) =>
      route.fulfill({ json: PICK_LIST }),
    );

    await page.goto("/production");
    await page.getByTestId("run-card-RUN1").click();

    await expect(page).toHaveURL(/\/production\/runs\/RUN1/);
    await expect(page.getByTestId("pick-list")).toBeVisible();
    await expect(page.getByTestId("pick-row-base-C1")).toBeVisible();
    // The number button carries the prefilled requirement (14).
    await expect(page.getByTestId("pick-edit-base-C1")).toContainText("14");
    await expect(page.getByTestId("pick-edit-base-C2")).toContainText("8");
  });

  test("Done stays disabled until every row is resolved, then enables", async ({ page }) => {
    await setFakeRole(page, "operator");
    await stubToday(page, [todayRow()]);
    await page.route("**/api/production-runs/*/pick-list", (route) =>
      route.fulfill({ json: PICK_LIST }),
    );

    await page.goto("/production/runs/RUN1");

    const done = page.getByTestId("done-collecting");
    await expect(done).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("done-blocked-reason")).toBeVisible();

    // Confirm the first row (tap the body).
    await page.getByTestId("pick-confirm-base-C1").click();
    await expect(page.getByTestId("pick-row-base-C1")).toHaveAttribute("data-state", "PICKED");
    await expect(done).toHaveAttribute("aria-disabled", "true");

    // Edit the second row to a new actual amount.
    await page.getByTestId("pick-edit-base-C2").click();
    await expect(page.getByTestId("edit-qty-sheet")).toBeVisible();
    await page.getByTestId("edit-qty-input").fill("5");
    await page.getByTestId("edit-qty-save").click();
    await expect(page.getByTestId("pick-row-base-C2")).toHaveAttribute("data-state", "EDITED");
    await expect(page.getByTestId("pick-edit-base-C2")).toContainText("5");

    // Both resolved → gate opens.
    await expect(done).toHaveAttribute("aria-disabled", "false");

    // Confirm flow: dialog → yes → success (pick-confirm mocked 201).
    await page.route("**/api/production-runs/*/pick-confirm", (route) =>
      route.fulfill({
        status: 201,
        json: {
          run_id: "RUN1",
          submission_id: "SUB1",
          status: "posted",
          run_status: "PICKING",
          linked_plan_id: "PLAN1",
          consumed: [],
          shortfalls: [],
          signals: [],
          idempotent_replay: false,
        },
      }),
    );
    await done.click();
    await expect(page.getByTestId("done-confirm")).toBeVisible();
    await page.getByTestId("done-confirm-yes").click();
    await expect(page.getByTestId("pick-done-success")).toBeVisible();
  });

  test("unplanned-run dialog opens with a product list", async ({ page }) => {
    await setFakeRole(page, "operator");
    await stubToday(page, []);
    await page.route("**/api/items**", (route) =>
      route.fulfill({
        json: {
          rows: [
            {
              item_id: "ITEM9",
              item_name: "Test cocktail",
              sku: "SKU9",
              status: "ACTIVE",
              supply_method: "MANUFACTURED",
              sales_uom: "UNIT",
            },
          ],
          count: 1,
        },
      }),
    );

    await page.goto("/production");
    await page.getByTestId("unplanned-run-open-empty").click();
    await expect(page.getByTestId("unplanned-run-dialog")).toBeVisible();
    await expect(page.getByTestId("unplanned-item-ITEM9")).toBeVisible();

    // Pick the product → qty defaults to 1 → start enabled.
    await page.getByTestId("unplanned-item-ITEM9").click();
    await expect(page.getByTestId("unplanned-qty")).toHaveValue("1");
  });
});
