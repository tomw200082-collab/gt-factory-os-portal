import { expect, test } from "@playwright/test";
import { setFakeRole } from "./helpers";

// Tablet-only spec — runs under the tablet Playwright project
// (playwright.config.ts), iPad Mini device (768x1024, WebKit). Tom asked
// explicitly (2026-07-25) that "today's runs" work perfectly on tablet, not
// just mobile — the /production corridor's Gate 5 audit (tranches 145/146)
// only rendered real screenshots at 390/1440, never at the 768px mobile->
// desktop transition zone (Tailwind's `md` breakpoint), where layout is
// most likely to break. This closes that gap.

const TODAY_ROW = {
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
};

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
    { component_id: "C1", component_name: "Sugar", source: "base", item_type: "RM", required_qty: "14", uom: "kg", on_hand: "50" },
    {
      component_id: "C2",
      component_name: "Lemon juice concentrate double strength",
      source: "base",
      item_type: "RM",
      required_qty: "144000.5",
      uom: "L",
      on_hand: "20",
    },
  ],
};

test.describe("tablet WebKit (iPad Mini, 768px) — /production corridor", () => {
  test("today's runs list has no horizontal scroll trap", async ({ page }) => {
    await setFakeRole(page, "operator");
    await page.route("**/api/production-runs/today**", (route) =>
      route.fulfill({ json: { date: "2026-07-25", count: 1, rows: [TODAY_ROW] } }),
    );

    await page.goto("/production");
    await expect(page.getByTestId("run-list")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: "test-results/tablet-production-screenshots/01-runs-list.png",
      fullPage: true,
    });

    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHScroll).toBe(false);
  });

  test("pick list, edit sheet, and long quantities render fully at 768px", async ({ page }) => {
    await setFakeRole(page, "operator");
    await page.route("**/api/production-runs/today**", (route) =>
      route.fulfill({ json: { date: "2026-07-25", count: 1, rows: [TODAY_ROW] } }),
    );
    await page.route("**/api/production-runs/*/pick-list**", (route) =>
      route.fulfill({ json: PICK_LIST }),
    );

    await page.goto("/production/runs/RUN1");
    await expect(page.getByTestId("pick-row-base-C1")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: "test-results/tablet-production-screenshots/02-pick-list.png",
      fullPage: true,
    });

    // Tom's 2026-07-25 report: numbers sometimes clip while collecting.
    // At 768px the number button must still show the full value.
    await expect(page.getByTestId("pick-edit-base-C2")).toContainText("144000.5");

    await page.getByTestId("pick-edit-base-C1").click();
    await expect(page.getByTestId("edit-qty-sheet")).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: "test-results/tablet-production-screenshots/03-edit-qty-sheet.png",
      fullPage: true,
    });

    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHScroll).toBe(false);
  });
});
