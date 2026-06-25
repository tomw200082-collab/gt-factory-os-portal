// The money math behind the Profitability tab: per-SKU margin + embedded
// margin in stock, and the viability-segment split. If these drift the CFO
// view lies — so they get the one check.

import { describe, expect, it } from "vitest";
import { deriveSku, classifySegment, type ProfitRow } from "./ProfitabilityTab";

function row(p: Partial<ProfitRow>): ProfitRow {
  return {
    item_id: "x",
    item_name: "X",
    cogs_per_unit_ils: "6",
    cogs_complete: true,
    avg_sale_price_ils: "10",
    material_margin_ils: null, // force the derived path
    material_margin_pct: null,
    qty_on_hand: "100",
    fg_inventory_value_at_cost: null, // force the derived path
    fg_inventory_value_at_sale_price: null,
    embedded_material_margin_in_stock: null,
    reliability_flag: null,
    ...p,
  };
}

describe("deriveSku", () => {
  it("derives margin, %, inventory value and embedded margin from raw fields", () => {
    const s = deriveSku(row({}));
    expect(s.marginUnit).toBe(4); // 10 - 6
    expect(s.marginPct).toBeCloseTo(40);
    expect(s.invAtCost).toBe(600); // 6 × 100
    expect(s.invAtSale).toBe(1000); // 10 × 100
    expect(s.embedded).toBe(400); // 4 × 100
    expect(s.measured).toBe(true);
    expect(s.inStock).toBe(true);
  });

  it("is not measured without a price or with COGS incomplete", () => {
    expect(deriveSku(row({ avg_sale_price_ils: null })).measured).toBe(false);
    expect(deriveSku(row({ cogs_complete: false })).measured).toBe(false);
  });

  it("does not require sales to be measured (production has zero velocity)", () => {
    // No sales fields exist on the row at all — margin alone makes it measured.
    expect(deriveSku(row({ qty_on_hand: "0" })).measured).toBe(true);
  });

  it("flags a below-cost unit as negative margin", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "4" })); // cost 6
    expect(s.marginUnit).toBe(-2);
    expect(s.embedded).toBe(-200);
  });
});

describe("classifySegment", () => {
  const medianEmbedded = 100;
  it("loss short-circuits regardless of value at stake", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "4" }));
    expect(classifySegment(s, 30, medianEmbedded)).toBe("loss");
  });
  it("crown = high margin and above-median margin in stock", () => {
    const s = deriveSku(row({})); // 40% margin, embedded 400 ≥ 100, in stock
    expect(classifySegment(s, 30, medianEmbedded)).toBe("crown");
  });
  it("risk = low margin but lots of margin value in stock", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "7" })); // ~14% margin, embedded 100
    expect(classifySegment(s, 30, medianEmbedded)).toBe("risk");
  });
  it("premium = high margin but little at stake (no stock)", () => {
    const s = deriveSku(row({ qty_on_hand: "0" })); // 40% margin, embedded 0
    expect(classifySegment(s, 30, medianEmbedded)).toBe("premium");
  });
  it("review = low margin and little at stake", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "7", qty_on_hand: "0" }));
    expect(classifySegment(s, 30, medianEmbedded)).toBe("review");
  });
});
