// The money math behind the Profitability tab: per-SKU contribution and the
// viability-quadrant split. If these drift, the CFO view lies — so they get
// the one check.

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
    qty_sold_90d: "100",
    order_count_90d: 10,
    revenue_90d_ils: "1000",
    qty_on_hand: "0",
    ...p,
  };
}

describe("deriveSku", () => {
  it("derives margin, %, and contribution when the API leaves them null", () => {
    const s = deriveSku(row({}));
    expect(s.marginUnit).toBe(4); // 10 - 6
    expect(s.marginPct).toBeCloseTo(40);
    expect(s.contribution90d).toBe(400); // 4 × 100
    expect(s.analysable).toBe(true);
  });

  it("is not analysable without a sale price or without recent sales", () => {
    expect(deriveSku(row({ avg_sale_price_ils: null })).analysable).toBe(false);
    expect(deriveSku(row({ qty_sold_90d: "0" })).analysable).toBe(false);
  });

  it("flags a below-cost unit as negative margin", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "4" })); // cost 6
    expect(s.marginUnit).toBe(-2);
    expect(s.contribution90d).toBe(-200);
  });
});

describe("classifySegment", () => {
  const median = 1000;
  it("loss short-circuits regardless of revenue", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "4", revenue_90d_ils: "5000" }));
    expect(classifySegment(s, 30, median)).toBe("loss");
  });
  it("star = above target margin and above median revenue", () => {
    const s = deriveSku(row({ revenue_90d_ils: "2000" })); // 40% margin
    expect(classifySegment(s, 30, median)).toBe("star");
  });
  it("cash = below target margin but above median revenue", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "7", revenue_90d_ils: "2000" })); // ~14%
    expect(classifySegment(s, 30, median)).toBe("cash");
  });
  it("review = below target margin and below median revenue", () => {
    const s = deriveSku(row({ avg_sale_price_ils: "7", revenue_90d_ils: "100" }));
    expect(classifySegment(s, 30, median)).toBe("review");
  });
});
