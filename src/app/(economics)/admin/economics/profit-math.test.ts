// The money math behind the Profitability tab: per-SKU margin + embedded
// margin in stock, and the viability-segment split. If these drift the CFO
// view lies — so they get the one check.

import { describe, expect, it } from "vitest";
import {
  deriveSku,
  classifySegment,
  treemapLayout,
  type ProfitRow,
  type SkuEconomics,
  type TreemapRect,
} from "./ProfitabilityTab";

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
    cogs_snapshot_at: null,
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

describe("treemapLayout", () => {
  // Tiles must cover the box exactly, never overlap-by-area, and produce one
  // rect per item with finite, in-bounds coordinates.
  function skuWith(id: string, embedded: number): SkuEconomics {
    return deriveSku(
      row({
        item_id: id,
        embedded_material_margin_in_stock: String(embedded),
        qty_on_hand: "1",
      }),
    );
  }
  it("emits one in-bounds rect per item whose areas sum to the box", () => {
    const items = [10, 7, 5, 3, 2, 1].map((v, i) => skuWith(`s${i}`, v));
    const out: TreemapRect[] = [];
    treemapLayout(items, 0, 0, 100, 100, true, out);
    expect(out).toHaveLength(items.length);
    let area = 0;
    for (const r of out) {
      expect(r.x).toBeGreaterThanOrEqual(-0.001);
      expect(r.y).toBeGreaterThanOrEqual(-0.001);
      expect(r.x + r.w).toBeLessThanOrEqual(100.001);
      expect(r.y + r.h).toBeLessThanOrEqual(100.001);
      expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
      area += r.w * r.h;
    }
    expect(area).toBeCloseTo(100 * 100, 0);
  });
  it("handles a single item and an empty list", () => {
    const one: TreemapRect[] = [];
    treemapLayout([skuWith("a", 5)], 0, 0, 100, 50, true, one);
    expect(one).toHaveLength(1);
    expect(one[0].w).toBe(100);
    const none: TreemapRect[] = [];
    treemapLayout([], 0, 0, 100, 100, true, none);
    expect(none).toHaveLength(0);
  });
});
