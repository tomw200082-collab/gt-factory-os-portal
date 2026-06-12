// Tranche 061 — Week panel rollups.
import { describe, expect, it } from "vitest";
import { weekProcurement, weekProduction } from "./week";

describe("weekProcurement", () => {
  it("splits to-order (proposed+approved) from placed, and isolates approved-not-placed", () => {
    const w = weekProcurement([
      { status: "proposed", currency: "ILS", total_cost: 5200 },
      { status: "approved", currency: "ILS", total_cost: 9100 },
      { status: "placed", currency: "ILS", total_cost: 4000 },
      { status: "skipped", currency: "ILS", total_cost: 999 },
    ]);
    expect(w.toOrderIls).toBe(14_300);
    expect(w.toOrderCount).toBe(2);
    expect(w.approvedNotPlacedIls).toBe(9_100);
    expect(w.approvedNotPlacedCount).toBe(1);
    expect(w.placedIls).toBe(4_000);
    expect(w.placedCount).toBe(1);
    expect(w.foreignCount).toBe(0);
  });

  it("excludes foreign currency from sums and counts it", () => {
    const w = weekProcurement([
      { status: "approved", currency: "USD", total_cost: 1000 },
      { status: "proposed", currency: "ILS", total_cost: 200 },
    ]);
    expect(w.toOrderIls).toBe(200);
    expect(w.foreignCount).toBe(1);
  });

  it("treats missing currency as ILS", () => {
    const w = weekProcurement([{ status: "proposed", currency: "", total_cost: 70 }]);
    expect(w.toOrderIls).toBe(70);
  });

  it("empty session yields zeros", () => {
    const w = weekProcurement([]);
    expect(w.toOrderIls).toBe(0);
    expect(w.placedCount).toBe(0);
  });
});

describe("weekProduction", () => {
  it("counts runs (UOM-agnostic) and completed runs", () => {
    const w = weekProduction([
      { planned_qty: 100, completed_qty: 100 },
      { planned_qty: 50, completed_qty: 10 },
      { planned_qty: 80, completed_qty: 0, status: "CANCELLED" },
    ]);
    expect(w.totalRuns).toBe(2);
    expect(w.doneRuns).toBe(1);
  });

  it("zero-planned rows never count as done", () => {
    const w = weekProduction([{ planned_qty: 0, completed_qty: 0 }]);
    expect(w.doneRuns).toBe(0);
    expect(w.totalRuns).toBe(1);
  });
});
