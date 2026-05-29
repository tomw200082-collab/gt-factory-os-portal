// ---------------------------------------------------------------------------
// inventory-flow-risk.test.ts — unit tests for the risk-tier classification,
// sorting, and predicate helpers in inventory-flow/_lib/risk.ts.
//
// compareItemsByRisk drives the at-the-top-of-the-grid ordering (the whole
// "stockouts surface first" inverted hierarchy), and the production-aware
// cell-class fallback chain is the front-line defense against API/portal
// deployment-ordering skew. Both are pure and deterministic.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  compareItemsByRisk,
  dayCellClassNameProduction,
  hasIncomingPo,
  isAtRisk,
  isDemandSpike,
  weekCellClassNameProduction,
} from "@/app/(planning)/planning/inventory-flow/_lib/risk";
import type {
  FlowItem,
  RiskTier,
} from "@/app/(planning)/planning/inventory-flow/_lib/types";

function item(partial: Partial<FlowItem> & Pick<FlowItem, "item_id">): FlowItem {
  return {
    item_name: partial.item_id,
    family: null,
    sku_kind: "ITEM",
    supply_method: "MANUFACTURED",
    risk_tier: "healthy",
    days_of_cover: 99,
    effective_lead_time_days: 7,
    current_on_hand: 0,
    earliest_stockout_date: null,
    days: [],
    weeks: [],
    ...partial,
  };
}

describe("isAtRisk", () => {
  it("treats every non-healthy tier as at-risk", () => {
    expect(isAtRisk("stockout")).toBe(true);
    expect(isAtRisk("critical")).toBe(true);
    expect(isAtRisk("watch")).toBe(true);
    expect(isAtRisk("healthy")).toBe(false);
  });
});

describe("hasIncomingPo", () => {
  it("is true only for a positive incoming_supply", () => {
    expect(hasIncomingPo({ incoming_supply: 5 })).toBe(true);
    expect(hasIncomingPo({ incoming_supply: 0 })).toBe(false);
    expect(hasIncomingPo({ incoming_supply: -1 })).toBe(false);
  });
});

describe("isDemandSpike", () => {
  it("flags a day whose total demand is >= 2x the window average", () => {
    expect(isDemandSpike(20, 10)).toBe(true); // exactly 2x
    expect(isDemandSpike(25, 10)).toBe(true);
    expect(isDemandSpike(19, 10)).toBe(false);
  });

  it("never flags a spike when the average is zero or negative", () => {
    expect(isDemandSpike(100, 0)).toBe(false);
    expect(isDemandSpike(100, -5)).toBe(false);
  });
});

describe("compareItemsByRisk", () => {
  it("orders by tier rank: stockout < critical < watch < healthy", () => {
    const tiers: RiskTier[] = ["healthy", "watch", "stockout", "critical"];
    const sorted = tiers
      .map((t, i) => item({ item_id: `i${i}`, risk_tier: t }))
      .sort(compareItemsByRisk)
      .map((it) => it.risk_tier);
    expect(sorted).toEqual(["stockout", "critical", "watch", "healthy"]);
  });

  it("within a tier, breaks ties by earliest_stockout_date ascending (null last)", () => {
    const a = item({
      item_id: "a",
      risk_tier: "critical",
      earliest_stockout_date: "2026-06-10",
    });
    const b = item({
      item_id: "b",
      risk_tier: "critical",
      earliest_stockout_date: "2026-06-01",
    });
    const c = item({
      item_id: "c",
      risk_tier: "critical",
      earliest_stockout_date: null,
    });
    const sorted = [a, b, c].sort(compareItemsByRisk).map((it) => it.item_id);
    expect(sorted).toEqual(["b", "a", "c"]);
  });

  it("falls back to days_of_cover ascending, then name, when dates are equal", () => {
    const a = item({
      item_id: "a",
      item_name: "Zebra",
      risk_tier: "watch",
      earliest_stockout_date: null,
      days_of_cover: 12,
    });
    const b = item({
      item_id: "b",
      item_name: "Apple",
      risk_tier: "watch",
      earliest_stockout_date: null,
      days_of_cover: 5,
    });
    const c = item({
      item_id: "c",
      item_name: "Mango",
      risk_tier: "watch",
      earliest_stockout_date: null,
      days_of_cover: 5,
    });
    // b and c share cover 5 → name tiebreak (Apple < Mango); a has cover 12 → last
    const sorted = [a, b, c].sort(compareItemsByRisk).map((it) => it.item_id);
    expect(sorted).toEqual(["b", "c", "a"]);
  });
});

describe("dayCellClassNameProduction", () => {
  it("prefers the 5-tier production-aware class when present", () => {
    expect(dayCellClassNameProduction("critical_stockout", "healthy")).toContain(
      "bg-tier-critical-bg",
    );
    expect(dayCellClassNameProduction("healthy", "stockout")).toContain(
      "bg-tier-healthy-bg",
    );
  });

  it("falls back to the production-blind 4-tier class when the field is missing", () => {
    // Defensive against API/portal deployment ordering.
    expect(dayCellClassNameProduction(null, "stockout")).toContain("bg-danger-soft");
    expect(dayCellClassNameProduction(undefined, "healthy")).toContain(
      "bg-success-softer",
    );
  });
});

describe("weekCellClassNameProduction", () => {
  it("prefers the server-computed week classifier when present", () => {
    expect(weekCellClassNameProduction("at_risk", "healthy", false)).toContain(
      "bg-tier-at-risk-bg",
    );
  });

  it("maps a production-aware stockout to the critical class in the fallback path", () => {
    expect(weekCellClassNameProduction(null, "healthy", true)).toContain(
      "bg-tier-critical-bg",
    );
  });

  it("maps legacy 4-tier values onto the 5-tier gradient in the fallback path", () => {
    expect(weekCellClassNameProduction(null, "stockout", false)).toContain(
      "bg-tier-critical-bg",
    );
    expect(weekCellClassNameProduction(null, "critical", false)).toContain(
      "bg-tier-at-risk-bg",
    );
    expect(weekCellClassNameProduction(null, "watch", false)).toContain(
      "bg-tier-low-bg",
    );
    expect(weekCellClassNameProduction(null, "healthy", false)).toContain(
      "bg-tier-healthy-bg",
    );
  });
});
