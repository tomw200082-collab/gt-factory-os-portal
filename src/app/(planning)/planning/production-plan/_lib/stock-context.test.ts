import { describe, expect, it } from "vitest";

import {
  buildStockContext,
  coverAfterRun,
  dailyDemandRate,
  findFlowItem,
  produceByDate,
  projectedOnHandAt,
} from "./stock-context";
import { makeFlowItem } from "../../inventory-flow/_lib/flowFixture";
import type { FlowDay, FlowItem, FlowResponse } from "../../inventory-flow/_lib/types";

function mkDay(overrides: Partial<FlowDay> = {}): FlowDay {
  return {
    day: "2026-07-02",
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

// 14 days from 2026-07-02, each with a distinct on-hand balance so
// projectedOnHandAt can be asserted against a specific date, and full 14-day
// demand coverage so dailyDemandRate's /14 divisor reflects a real daily rate
// (a shorter fixture would silently understate it — demandSum14 sums
// whatever `days` holds, even if it's fewer than 14 entries).
function makeDays(count: number): FlowDay[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 6, 2 + i); // month is 0-indexed: 6 = July
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return mkDay({
      day: iso,
      demand_lionwheel: 5,
      demand_forecast: 5,
      projected_on_hand_eod_with_production: 100 - (i + 1) * 10,
    });
  });
}

function flowOf(items: FlowItem[]): FlowResponse {
  return {
    as_of: "2026-07-02T00:00:00Z",
    summary: {
      at_risk_count: 0,
      earliest_stockout: null,
      open_orders_count: 0,
      exceptions_count: 0,
      unknown_sku_pct_of_demand: 0,
    },
    items,
  };
}

describe("findFlowItem", () => {
  it("finds an item by id", () => {
    const item = makeFlowItem({ item_id: "babka" });
    expect(findFlowItem(flowOf([item]), "babka")).toBe(item);
  });

  it("returns null when the item is missing, itemId is null, or flow is undefined", () => {
    const item = makeFlowItem({ item_id: "babka" });
    expect(findFlowItem(flowOf([item]), "other")).toBeNull();
    expect(findFlowItem(flowOf([item]), null)).toBeNull();
    expect(findFlowItem(undefined, "babka")).toBeNull();
  });
});

describe("dailyDemandRate", () => {
  it("averages 14-day demand", () => {
    const item = makeFlowItem({
      days: Array.from({ length: 14 }, () =>
        mkDay({ demand_lionwheel: 3, demand_forecast: 4 }),
      ),
    });
    expect(dailyDemandRate(item)).toBe(7); // (3+4)*14 / 14
  });
});

describe("projectedOnHandAt", () => {
  it("returns the production-aware EOD balance for a known day", () => {
    const item = makeFlowItem({ days: makeDays(14) });
    expect(projectedOnHandAt(item, "2026-07-04")).toBe(70); // day index 2 -> 100-30
  });

  it("returns null when the date is outside the projection horizon", () => {
    const item = makeFlowItem({ days: makeDays(14) });
    expect(projectedOnHandAt(item, "2099-01-01")).toBeNull();
  });
});

describe("coverAfterRun", () => {
  it("computes days of cover from on-hand + qty over the daily rate", () => {
    expect(coverAfterRun(50, 100, 15)).toBeCloseTo(10, 5);
  });

  it("returns null when there is no demand to divide by", () => {
    expect(coverAfterRun(50, 100, 0)).toBeNull();
    expect(coverAfterRun(50, 100, -1)).toBeNull();
  });
});

describe("produceByDate", () => {
  it("is one calendar day before the stockout date", () => {
    expect(produceByDate("2026-07-10")).toBe("2026-07-09");
  });

  it("crosses a month boundary correctly", () => {
    expect(produceByDate("2026-08-01")).toBe("2026-07-31");
  });
});

describe("buildStockContext — not found", () => {
  it("returns itemFound=false with all other fields null/false", () => {
    const ctx = buildStockContext(null, "2026-07-04", null);
    expect(ctx.itemFound).toBe(false);
    expect(ctx.onHandNow).toBeNull();
    expect(ctx.coveredByPlan).toBe(false);
  });
});

describe("buildStockContext — stockout resolution", () => {
  it("treats an explicit null stockout_at_day_with_production as covered (no fallback to the blind projection)", () => {
    const item = makeFlowItem({
      earliest_stockout_date: "2026-07-05", // blind projection would stock out...
      stockout_at_day_with_production: null, // ...but production rescues it
      days_cover_with_production: 56,
      days: makeDays(14),
    });
    const ctx = buildStockContext(item, "2026-07-04", null);
    expect(ctx.hasStockoutInHorizon).toBe(false);
    expect(ctx.stockoutDate).toBeNull();
    expect(ctx.produceBy).toBeNull();
  });

  it("falls back to earliest_stockout_date when the production-aware field is undefined (not yet shipped)", () => {
    const item = makeFlowItem({
      earliest_stockout_date: "2026-07-10",
      days: makeDays(14),
    });
    delete (item as { stockout_at_day_with_production?: string | null })
      .stockout_at_day_with_production;
    const ctx = buildStockContext(item, "2026-07-04", null);
    expect(ctx.stockoutDate).toBe("2026-07-10");
    expect(ctx.produceBy).toBe("2026-07-09");
  });

  it("derives produce-by as one day before an in-horizon production-aware stockout", () => {
    const item = makeFlowItem({
      stockout_at_day_with_production: "2026-07-08",
      days: makeDays(14),
    });
    const ctx = buildStockContext(item, "2026-07-04", null);
    expect(ctx.hasStockoutInHorizon).toBe(true);
    expect(ctx.produceBy).toBe("2026-07-07");
  });
});

describe("buildStockContext — cover after run", () => {
  it("card mode (previewQty null) reads days_cover_with_production verbatim", () => {
    const item = makeFlowItem({
      days_cover_with_production: 23,
      days: makeDays(14),
    });
    const ctx = buildStockContext(item, "2026-07-04", null);
    expect(ctx.coverAfterRunDays).toBe(23);
  });

  it("preview mode (qty typed) recomputes cover with the qty added, not the verbatim field", () => {
    const item = makeFlowItem({
      days_cover_with_production: 23, // must be ignored once a qty is previewed
      days: makeDays(14),
    });
    // at 2026-07-04 on-hand is 70 (see makeDays); demand rate is (5+5)=10/day
    const ctx = buildStockContext(item, "2026-07-04", 30);
    expect(ctx.coverAfterRunDays).toBeCloseTo((70 + 30) / 10, 5);
  });

  it("ignores a zero or negative preview qty and falls back to the verbatim field", () => {
    const item = makeFlowItem({ days_cover_with_production: 23, days: makeDays(14) });
    expect(buildStockContext(item, "2026-07-04", 0).coverAfterRunDays).toBe(23);
    expect(buildStockContext(item, "2026-07-04", -5).coverAfterRunDays).toBe(23);
  });

  it("flags beyondHorizon so the live override can't add onto an unknown on-hand balance", () => {
    // Beyond the horizon there is no projected_on_hand_eod_with_production to
    // add the previewed qty onto, so the live override is skipped and the
    // verbatim field comes through instead. The component (not this pure
    // function) is what decides to show "Beyond the 8-week forecast window"
    // in place of this number when beyondHorizon is true.
    const item = makeFlowItem({ days_cover_with_production: 56, days: makeDays(14) });
    const ctx = buildStockContext(item, "2099-01-01", 30);
    expect(ctx.beyondHorizon).toBe(true);
    expect(ctx.coverAfterRunDays).toBe(56);
  });
});

describe("buildStockContext — coveredByPlan passthrough", () => {
  it("is true when the blind projection stocks out but production rescues it", () => {
    const item = makeFlowItem({
      earliest_stockout_date: "2026-07-05",
      stockout_at_day_with_production: null,
      days_cover_with_production: 56,
      days: makeDays(14),
    });
    expect(buildStockContext(item, "2026-07-04", null).coveredByPlan).toBe(true);
  });

  it("is false when there is no blind-projection stockout to rescue", () => {
    const item = makeFlowItem({
      earliest_stockout_date: null,
      stockout_at_day_with_production: null,
      days_cover_with_production: 56,
      days: makeDays(14),
    });
    expect(buildStockContext(item, "2026-07-04", null).coveredByPlan).toBe(false);
  });
});
