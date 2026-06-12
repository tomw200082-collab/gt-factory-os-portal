import { describe, expect, it } from "vitest";

import {
  coveredByPlan,
  demandSum14,
  incomingSum14,
  parseSortKey,
  shortfallSum14,
  sortItems,
} from "./production-lens";
import type { FlowDay, FlowItem } from "./types";

function mkDay(overrides: Partial<FlowDay> = {}): FlowDay {
  return {
    day: "2026-06-12",
    is_working_day: true,
    holiday_name_he: null,
    demand_lionwheel: 0,
    demand_forecast: 0,
    incoming_supply: 0,
    projected_on_hand_eod: 0,
    inflow_from_production: 0,
    incoming_supply_combined: 0,
    projected_on_hand_eod_with_production: 0,
    tier: "healthy",
    shortfall_qty: 0,
    shortfall_qty_with_production: 0,
    ...overrides,
  };
}

function mkItem(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    item_id: "I1",
    item_name: "Item 1",
    family: null,
    sku_kind: "ITEM",
    supply_method: "MANUFACTURED",
    risk_tier: "healthy",
    days_of_cover: 30,
    effective_lead_time_days: 3,
    current_on_hand: 100,
    earliest_stockout_date: null,
    days: Array.from({ length: 14 }, () => mkDay()),
    weeks: [],
    ...overrides,
  };
}

describe("parseSortKey", () => {
  it("accepts the four known keys", () => {
    expect(parseSortKey("urgency")).toBe("urgency");
    expect(parseSortKey("gap")).toBe("gap");
    expect(parseSortKey("demand")).toBe("demand");
    expect(parseSortKey("family")).toBe("family");
  });
  it("falls back to urgency for null / unknown", () => {
    expect(parseSortKey(null)).toBe("urgency");
    expect(parseSortKey(undefined)).toBe("urgency");
    expect(parseSortKey("hacked")).toBe("urgency");
  });
});

describe("14-day sums", () => {
  it("sums demand, incoming, shortfall over the first 14 days only", () => {
    const days = Array.from({ length: 20 }, () =>
      mkDay({
        demand_lionwheel: 2,
        demand_forecast: 3,
        incoming_supply_combined: 4,
        shortfall_qty_with_production: 1,
      }),
    );
    const item = mkItem({ days });
    expect(demandSum14(item)).toBe(14 * 5);
    expect(incomingSum14(item)).toBe(14 * 4);
    expect(shortfallSum14(item)).toBe(14);
  });
});

describe("coveredByPlan", () => {
  it("true when blind projection stocks out but production-aware does not", () => {
    expect(
      coveredByPlan(
        mkItem({
          earliest_stockout_date: "2026-06-20",
          stockout_at_day_with_production: null,
          days_cover_with_production: 56,
        }),
      ),
    ).toBe(true);
  });
  it("false when both projections stock out", () => {
    expect(
      coveredByPlan(
        mkItem({
          earliest_stockout_date: "2026-06-20",
          stockout_at_day_with_production: "2026-06-22",
          days_cover_with_production: 10,
        }),
      ),
    ).toBe(false);
  });
  it("false when nothing stocks out", () => {
    expect(coveredByPlan(mkItem())).toBe(false);
  });
});

describe("sortItems", () => {
  const stockout = mkItem({
    item_id: "S",
    item_name: "Stockout item",
    risk_tier: "stockout",
    earliest_stockout_date: "2026-06-14",
    days_of_cover: 0,
    family: "DETOX",
    days: Array.from({ length: 14 }, () =>
      mkDay({ demand_lionwheel: 1, shortfall_qty_with_production: 5 }),
    ),
  });
  const bigGap = mkItem({
    item_id: "G",
    item_name: "Big gap item",
    risk_tier: "critical",
    days_of_cover: 4,
    family: "FRESH",
    days: Array.from({ length: 14 }, () =>
      mkDay({ demand_lionwheel: 2, shortfall_qty_with_production: 50 }),
    ),
  });
  const bigDemand = mkItem({
    item_id: "D",
    item_name: "Big demand item",
    risk_tier: "healthy",
    days_of_cover: 40,
    family: "AMOUR",
    days: Array.from({ length: 14 }, () => mkDay({ demand_forecast: 100 })),
  });

  it("urgency puts the stockout first", () => {
    expect(sortItems([bigDemand, bigGap, stockout], "urgency").map((i) => i.item_id)).toEqual([
      "S",
      "G",
      "D",
    ]);
  });

  it("gap puts the biggest 14-day shortfall first", () => {
    expect(sortItems([stockout, bigDemand, bigGap], "gap").map((i) => i.item_id)).toEqual([
      "G",
      "S",
      "D",
    ]);
  });

  it("demand puts the biggest 14-day mover first", () => {
    expect(sortItems([stockout, bigGap, bigDemand], "demand").map((i) => i.item_id)).toEqual([
      "D",
      "G",
      "S",
    ]);
  });

  it("family groups A→Z with urgency inside, null-family last", () => {
    const noFamily = mkItem({ item_id: "N", family: null });
    expect(
      sortItems([noFamily, stockout, bigGap, bigDemand], "family").map((i) => i.item_id),
    ).toEqual(["D", "S", "G", "N"]);
  });

  it("does not mutate the input array", () => {
    const arr = [bigDemand, stockout];
    sortItems(arr, "urgency");
    expect(arr.map((i) => i.item_id)).toEqual(["D", "S"]);
  });
});
