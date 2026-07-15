// ---------------------------------------------------------------------------
// Product Decision Board — deterministic e2e (Tranche 081 · fixture refreshed
// in Tranche 091 · moved to the unit-economics contract in Tranche 128).
//
// Tagged @mocked: stubs /api/unit-economics at the browser (page.route) so the
// board renders WITHOUT a live backend — same pattern as dashboard.spec.ts.
//
// Tranche 128: the page consumes the server CM2 read model only (corridor
// SPEC §V.1 — no money math in the browser), so this fixture emulates the
// SERVER contract: waterfall fields, decision, contribution, totals, meta and
// cost_model rows. The math below lives in the fixture precisely because the
// page no longer computes it.
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

// Fixture-side emulation of the server's unit-economics computation
// (v_fg_unit_economics + route): cost model = labor 1.5 ₪/unit + 5% fees +
// 3 ₪/order shipping; target margin 25%.
const LABOR = 1.5;
const FEES_PCT = 5;
const SHIP_PER_ORDER = 3;
const TARGET_PCT = 25;

function unitEconomicsBody() {
  type Row = Record<string, unknown> & { decision: string };
  const pre = PRODUCTS.map((p) => {
    const sold90 = p.units ? p.units[0] + p.units[1] + p.units[2] : 0;
    const prev90 = p.units
      ? Math.round(sold90 * (p.units[0] / Math.max(1, p.units[2])))
      : 0;
    const orders90 = sold90 > 0 ? Math.max(1, Math.round(sold90 / 12)) : 0;

    // price-basis ladder (SPEC §V.2/§V.13): realized when sold with revenue;
    // manual price when not; NONE + anomaly when sold but price unknowable.
    const realized = sold90 > 0 && p.price != null;
    const basis = realized ? "REALIZED_90D" : p.price != null ? "MANUAL" : "NONE";
    const anomaly = sold90 > 0 && p.price == null;
    const unitPrice = p.price;
    const revenue = realized ? (p.price! * sold90) : null;

    const materials = p.cogs;
    const judgeable = materials != null && p.complete && basis !== "NONE";
    const reason = materials == null
      ? (p.complete ? "NO_COGS" : "COGS_INCOMPLETE")
      : basis === "NONE" ? "NO_PRICE_BASIS" : null;

    const alloc = sold90 > 0 ? (SHIP_PER_ORDER * orders90) / sold90 : 0;
    const fees = unitPrice != null ? (unitPrice * FEES_PCT) / 100 : null;
    const cm1 = unitPrice != null && materials != null ? unitPrice - materials : null;
    const cm2 = cm1 != null && fees != null ? cm1 - LABOR - alloc - fees : null;
    const cm2Pct = cm2 != null && unitPrice ? (cm2 / unitPrice) * 100 : null;
    const target = materials != null
      ? (materials + LABOR + alloc) / (1 - FEES_PCT / 100 - TARGET_PCT / 100)
      : null;
    const contribution = judgeable && cm2 != null ? cm2 * sold90 : null;

    return { p, sold90, prev90, orders90, basis, anomaly, unitPrice, revenue, materials, judgeable, reason, alloc, fees, cm1, cm2, cm2Pct, target, contribution };
  });

  const selling = pre.filter((x) => x.judgeable && x.sold90 > 0).map((x) => x.sold90).sort((a, b) => a - b);
  const median = selling.length
    ? selling.length % 2
      ? selling[Math.floor(selling.length / 2)]
      : (selling[selling.length / 2 - 1] + selling[selling.length / 2]) / 2
    : 0;

  const rows: Row[] = pre.map((x) => {
    let decision: string;
    if (!x.judgeable || x.cm2Pct == null) decision = "needs_data";
    else if (x.cm2Pct < 0) decision = "loss";
    else if (x.sold90 === 0) decision = "dormant";
    else decision = x.cm2Pct >= TARGET_PCT ? (x.sold90 >= median ? "star" : "gem") : x.sold90 >= median ? "workhorse" : "drag";
    return {
      item_id: x.p.id,
      item_name: x.p.name,
      price_basis: x.basis,
      price_anomaly: x.anomaly,
      unit_price_ils: x.unitPrice != null ? x.unitPrice.toFixed(4) : null,
      qty_sold_90d: String(x.sold90),
      order_count_90d: x.orders90,
      units_prev_90d: String(x.prev90),
      revenue_90d_ils: x.revenue != null ? x.revenue.toFixed(4) : null,
      sales_synced_at: x.sold90 > 0 ? new Date().toISOString() : null,
      stale: false,
      materials_cogs_ils: x.materials != null ? x.materials.toFixed(4) : null,
      cogs_complete: x.p.complete,
      missing_cost_components: x.p.complete ? [] : [{ component_id: null, reason: "no cost" }],
      opex_per_unit_ils: LABOR.toFixed(4),
      fees_pct_total: FEES_PCT.toFixed(2),
      per_order_alloc_ils: x.alloc.toFixed(4),
      fees_per_unit_ils: x.fees != null ? x.fees.toFixed(4) : null,
      cm1_ils: x.cm1 != null ? x.cm1.toFixed(4) : null,
      cm1_pct: x.cm1 != null && x.unitPrice ? ((x.cm1 / x.unitPrice) * 100).toFixed(2) : null,
      cm2_ils: x.cm2 != null ? x.cm2.toFixed(4) : null,
      cm2_pct: x.cm2Pct != null ? x.cm2Pct.toFixed(2) : null,
      judgeable: x.judgeable,
      judge_block_reason: x.reason,
      qty_on_hand: String(x.p.onHand),
      fg_inventory_value_at_cost: x.materials != null ? (x.materials * x.p.onHand).toFixed(2) : null,
      cost_breakdown: {},
      target_price_ils: x.target != null ? x.target.toFixed(2) : null,
      contribution_90d_ils: x.contribution != null ? x.contribution.toFixed(4) : null,
      decision,
    };
  });

  const measurable = rows.filter((r) => r.contribution_90d_ils != null);
  const pool = measurable.reduce((s, r) => s + Number(r.contribution_90d_ils), 0);
  const lossRows = rows.filter((r) => r.decision === "loss");
  const risk90 = lossRows.reduce((s, r) => s + Math.abs(Number(r.contribution_90d_ils ?? 0)), 0);
  const positives = measurable.map((r) => Number(r.contribution_90d_ils)).filter((c) => c > 0).sort((a, b) => b - a);
  const top3 = positives.slice(0, 3).reduce((s, c) => s + c, 0);

  return {
    rows,
    totals: {
      profit_pool_90d: pool,
      profit_pool_annual: pool * (365 / 90),
      loss_count: lossRows.length,
      risk_annual: risk90 * (365 / 90),
      needs_data: rows.filter((r) => r.decision === "needs_data").length,
      concentration_top3_pct: pool > 0 ? (top3 / pool) * 100 : null,
      measurable_count: measurable.length,
      total_count: rows.length,
    },
    meta: { target_pct: TARGET_PCT, velocity_median: median, window_days: 90 },
    cost_model: [
      { cost_key: "LABOR", scope: "GLOBAL", basis: "per_unit_ils", value: String(LABOR), label_en: "Direct labor", active: true, updated_at: new Date().toISOString() },
      { cost_key: "OVERHEAD", scope: "GLOBAL", basis: "per_unit_ils", value: "0", label_en: "Factory overhead", active: false, updated_at: new Date().toISOString() },
      { cost_key: "CHANNEL_FEES", scope: "GLOBAL", basis: "pct_of_revenue", value: String(FEES_PCT), label_en: "Channel & payment fees", active: true, updated_at: new Date().toISOString() },
      { cost_key: "SHIPPING", scope: "GLOBAL", basis: "per_order_ils", value: String(SHIP_PER_ORDER), label_en: "Shipping & dispatch", active: true, updated_at: new Date().toISOString() },
    ],
    count: rows.length,
  };
}

async function mockBoard(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/unit-economics**", (route) =>
    route.fulfill({ json: unitEconomicsBody() }),
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

    // FLOW-007: the "Needs data" bucket has its own card in the filter strip.
    await expect(page.getByTestId("segment-needs_data")).toBeVisible();

    // FLOW-001: inspect via TAP (touch/click path — not hover) on a quadrant bubble.
    await page.getByTestId("quadrant").locator("circle[role='button']").first().click();
    await expect(page.getByTestId("inspector")).toBeVisible();

    // FLOW-001: inspect via TAP on a table row.
    await page.getByRole("row").filter({ hasText: "Classic Margarita 330ml" }).click();
    await expect(page.getByTestId("inspector")).toContainText("Classic Margarita 330ml");

    // FLOW-001: inspect via KEYBOARD — focus a row and press Enter.
    await page.getByRole("row").filter({ hasText: "Cola Classic 330ml" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("inspector")).toContainText("Cola Classic 330ml");

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
