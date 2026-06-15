import { describe, expect, it } from "vitest";
import {
  parseCoverageTrace,
  buildCoverageReasoning,
} from "./coverage-trace";

const RAW = {
  on_hand_inv: 12,
  total_horizon_demand_inv: 40,
  avg_daily_demand_inv: 2,
  cover_days: 20,
  safety_floor_inv: 8,
  need_date: "2026-06-22",
  projected_on_hand_at_need_inv: -6,
  consolidation_window_days: 7,
  window_demand_inv: 14,
  window_open_po_receipts_inv: 4,
  order_qty_inventory_uom: 36,
  purchase_to_inv_factor: 12,
  lead_time_days: 7,
  demand_model_version: "v2",
};

describe("parseCoverageTrace", () => {
  it("parses a well-formed trace", () => {
    const t = parseCoverageTrace(RAW);
    expect(t).not.toBeNull();
    expect(t!.on_hand_inv).toBe(12);
    expect(t!.need_date).toBe("2026-06-22");
    expect(t!.order_qty_inventory_uom).toBe(36);
  });

  it("coerces numeric strings (pg numeric arrives as text)", () => {
    const t = parseCoverageTrace({ ...RAW, on_hand_inv: "12.0000" });
    expect(t!.on_hand_inv).toBe(12);
  });

  it("returns null for non-objects / arrays / unrecognized shapes", () => {
    expect(parseCoverageTrace(null)).toBeNull();
    expect(parseCoverageTrace("x")).toBeNull();
    expect(parseCoverageTrace([1, 2])).toBeNull();
    expect(parseCoverageTrace({ foo: 1 })).toBeNull();
  });
});

describe("buildCoverageReasoning", () => {
  it("flags a stockout when projected balance at need is negative", () => {
    const r = buildCoverageReasoning(parseCoverageTrace(RAW));
    expect(r!.wouldRunOut).toBe(true);
    expect(r!.severity).toBe("stockout");
    expect(r!.demand).toBe(40);
    expect(r!.incoming).toBe(4);
  });

  it("flags below-safety when projected is positive but under the floor", () => {
    const r = buildCoverageReasoning(
      parseCoverageTrace({ ...RAW, projected_on_hand_at_need_inv: 5 }),
    );
    expect(r!.wouldRunOut).toBe(false);
    expect(r!.belowSafety).toBe(true);
    expect(r!.severity).toBe("below_safety");
  });

  it("is ok when projected stays at/above the safety floor", () => {
    const r = buildCoverageReasoning(
      parseCoverageTrace({ ...RAW, projected_on_hand_at_need_inv: 20 }),
    );
    expect(r!.severity).toBe("ok");
  });

  it("returns null for a null trace", () => {
    expect(buildCoverageReasoning(null)).toBeNull();
  });
});
