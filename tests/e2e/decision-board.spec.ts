// ---------------------------------------------------------------------------
// Product Decision Board — deterministic e2e (Tranche 081 · fixture refreshed
// in Tranche 091).
//
// Tagged @mocked: stubs /api/economics at the browser (page.route) so the board
// renders WITHOUT a live backend — same pattern as dashboard.spec.ts.
//
// The economics fixture now carries the Shopify trailing-90-day sales the page
// reads directly (qty_sold_90d / order_count_90d / units_prev_90d, migrations
// 0261/0262). The board no longer calls /api/orders/by-item-and-period, so that
// mock was removed.
//
// The fixture is a realistic GT Everyday catalogue spanning every decision
// category (star / gem / workhorse / drag / loss / dormant / needs-data) so
// the visual surfaces (verdict band, vitals, segments, quadrant, table) all
// populate.
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";
import { setFakeRole } from "./helpers";

interface Prod {
  id: string;
  name: string;
  price: number | null;
  cogs: number | null;
  complete: boolean;
  onHand: number;
  // trailing units across three trend points (oldest→newest); used to derive
  // the 90d total + a prior-90d figure that sets the quarter-over-quarter trend.
  // Omit ⇒ dormant / no sales.
  units?: [number, number, number];
}

// 15 products covering the full decision spread.
const PRODUCTS: Prod[] = [
  { id: "FG-MOJ", name: "Mojito 330ml", price: 12, cogs: 7.2, complete: true, onHand: 540, units: [1300, 1400, 1500] }, // STAR
  { id: "FG-MAR", name: "Classic Margarita 330ml", price: 14, cogs: 8.0, complete: true, onHand: 480, units: [1300, 1250, 1250] }, // STAR
  { id: "FG-SMO", name: "Strawberry Smoothie 330ml", price: 13, cogs: 9.7, complete: true, onHand: 300, units: [900, 850, 850] }, // STAR/borderline
  { id: "FG-PCH", name: "Iced Peach Tea 500ml", price: 10, cogs: 5.0, complete: true, onHand: 220, units: [180, 200, 220] }, // GEM
  { id: "FG-ESP", name: "Espresso Martini 330ml", price: 16, cogs: 9.0, complete: true, onHand: 90, units: [140, 160, 180] }, // GEM
  { id: "FG-PIN", name: "Piña Colada 330ml", price: 14, cogs: 11.2, complete: true, onHand: 410, units: [1000, 1050, 1050] }, // WORKHORSE
  { id: "FG-COL", name: "Cola Classic 330ml", price: 7, cogs: 6.3, complete: true, onHand: 1700, units: [1700, 1750, 1750] }, // WORKHORSE
  { id: "FG-LEM", name: "Lemonade 500ml", price: 8, cogs: 7.4, complete: true, onHand: 880, units: [950, 980, 970] }, // WORKHORSE (thin)
  { id: "FG-LAS", name: "Mango Lassi 330ml", price: 11, cogs: 9.9, complete: true, onHand: 160, units: [200, 180, 160] }, // DRAG
  { id: "FG-HIB", name: "Hibiscus Iced Tea 500ml", price: 9, cogs: 8.6, complete: true, onHand: 120, units: [140, 120, 100] }, // DRAG
  { id: "FG-NEG", name: "Negroni 250ml", price: 18, cogs: 19.5, complete: true, onHand: 70, units: [320, 300, 280] }, // LOSS
  { id: "FG-APE", name: "Aperol Spritz 330ml", price: 15, cogs: 16.2, complete: true, onHand: 60, units: [110, 90, 80] }, // LOSS
  { id: "FG-CBR", name: "Cold Brew 500ml", price: 13, cogs: null, complete: false, onHand: 140, units: [220, 240, 240] }, // NEEDS DATA (no cogs)
  { id: "FG-PUM", name: "Pumpkin Spice Latte 330ml", price: null, cogs: 8.5, complete: true, onHand: 40, units: [40, 40, 40] }, // NEEDS DATA (no price)
  { id: "FG-WAT", name: "Watermelon Cooler 330ml", price: 12, cogs: 7.8, complete: true, onHand: 260 }, // DORMANT (no sales)
];

function economicsBody() {
  const rows = PRODUCTS.map((p) => {
    const marginIls = p.price != null && p.cogs != null ? p.price - p.cogs : null;
    const marginPct =
      marginIls != null && p.price ? (marginIls / p.price) * 100 : null;
    // 90d total + a prior-90d figure that preserves the within-series direction
    // (growing series ⇒ prior < current ⇒ up-trend, and vice-versa).
    const sold90 = p.units ? p.units[0] + p.units[1] + p.units[2] : 0;
    const prev90 = p.units
      ? Math.round(sold90 * (p.units[0] / Math.max(1, p.units[2])))
      : 0;
    const orders90 = sold90 > 0 ? Math.max(1, Math.round(sold90 / 12)) : 0;
    return {
      item_id: p.id,
      item_name: p.name,
      cogs_per_unit_ils: p.cogs != null ? p.cogs.toFixed(4) : null,
      cogs_complete: p.complete,
      missing_cost_components: p.complete ? [] : [{ component_id: null, reason: "no cost" }],
      cogs_snapshot_at: new Date().toISOString(),
      qty_on_hand: String(p.onHand),
      fg_inventory_value_at_cost: p.cogs != null ? (p.cogs * p.onHand).toFixed(2) : null,
      avg_sale_price_ils: p.price != null ? p.price.toFixed(2) : null,
      material_margin_ils: marginIls != null ? marginIls.toFixed(4) : null,
      material_margin_pct: marginPct != null ? marginPct.toFixed(2) : null,
      fg_inventory_value_at_sale_price: p.price != null ? (p.price * p.onHand).toFixed(2) : null,
      embedded_material_margin_in_stock: null,
      reliability_flag: "ok",
      // Shopify trailing-90-day sales (what the board reads for velocity).
      qty_sold_90d: String(sold90),
      order_count_90d: orders90,
      units_prev_90d: String(prev90),
    };
  });
  return { rows, count: rows.length };
}

async function mockBoard(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/economics**", (route) =>
    route.fulfill({ json: economicsBody() }),
  );
}

test.describe("@mocked Product Decision Board", () => {
  test("renders verdict, quadrant, segments and table; captures shots", async ({ page }) => {
    test.setTimeout(120_000);
    const logs: string[] = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

    await setFakeRole(page, "admin");
    await mockBoard(page);

    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/admin/decision-board", { waitUntil: "domcontentloaded", timeout: 90_000 });

    let appeared = true;
    try {
      await page.getByTestId("decision-board").waitFor({ state: "visible", timeout: 60_000 });
    } catch {
      appeared = false;
    }

    if (!appeared) {
      const txt = (await page.locator("body").innerText().catch(() => "")).slice(0, 800);
      // eslint-disable-next-line no-console
      console.log("\n=== BODY TEXT ===\n" + txt + "\n=== CONSOLE ===\n" + logs.join("\n"));
    }

    await page.waitForTimeout(1100); // let entrance animation settle
    await page.screenshot({ path: "/tmp/db/desktop.png", fullPage: true });

    expect(appeared, "decision-board testid should be visible").toBe(true);
    await expect(page.getByTestId("quadrant")).toBeVisible();
    await expect(page.getByTestId("verdict-band")).toBeVisible();
    await expect(page.getByTestId("segments")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Mojito 330ml" })).toBeVisible();

    // Close-ups for visual review.
    await page.getByTestId("quadrant").screenshot({ path: "/tmp/db/quadrant.png" });
    // Hover a bubble to exercise the inspector + crosshair, then capture.
    await page.getByTestId("quadrant").locator("circle").nth(3).hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/db/desktop-hover.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/db/mobile.png", fullPage: true });
  });
});
