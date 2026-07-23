import { describe, it, expect } from "vitest";
import { computeBatchProgress } from "./base-batch";
import type { ManifestMember, CoverageActual } from "./base-batch";

const PLAN = "11111111-1111-1111-1111-111111111111";

const manifest2: ManifestMember[] = [
  { item_id: "SKU-A", item_name: "Peach Tea 500ml", qty: "440", uom: "unit" },
  { item_id: "SKU-B", item_name: "Peach Tea 1.5L", qty: "120", uom: "unit" },
];

describe("computeBatchProgress", () => {
  it("reports zero coverage when no actuals exist", () => {
    const p = computeBatchProgress(manifest2, [], PLAN);
    expect(p.totalMembers).toBe(2);
    expect(p.reportedMembers).toBe(0);
    expect(p.anyReported).toBe(false);
    expect(p.allReported).toBe(false);
    expect(p.nextUnreportedItemId).toBe("SKU-A");
    expect(p.members[0]).toMatchObject({
      item_id: "SKU-A",
      plannedQty: 440,
      reportedQty: 0,
      reportedCount: 0,
      remainingQty: 440,
      reported: false,
    });
  });

  it("marks the first member reported and advances next to the second", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-A", output_qty: "430", reversed: false, from_plan_id: PLAN },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.reportedMembers).toBe(1);
    expect(p.anyReported).toBe(true);
    expect(p.allReported).toBe(false);
    expect(p.nextUnreportedItemId).toBe("SKU-B");
    expect(p.members[0].reported).toBe(true);
    expect(p.members[0].reportedQty).toBe(430);
    expect(p.members[0].remainingQty).toBe(10); // 440 planned − 430 reported
  });

  it("is allReported and has no next member once every SKU is covered", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-A", output_qty: "440", reversed: false, from_plan_id: PLAN },
      { item_id: "SKU-B", output_qty: "118", reversed: false, from_plan_id: PLAN },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.allReported).toBe(true);
    expect(p.reportedMembers).toBe(2);
    expect(p.nextUnreportedItemId).toBeNull();
    expect(p.members[1].remainingQty).toBe(2);
  });

  it("sums multiple non-reversed reports for the same member", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-A", output_qty: "200", reversed: false, from_plan_id: PLAN },
      { item_id: "SKU-A", output_qty: "240", reversed: false, from_plan_id: PLAN },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.members[0].reportedQty).toBe(440);
    expect(p.members[0].reportedCount).toBe(2);
    expect(p.members[0].remainingQty).toBe(0);
  });

  it("excludes reversed actuals from coverage", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-A", output_qty: "440", reversed: true, from_plan_id: PLAN },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.members[0].reported).toBe(false);
    expect(p.members[0].reportedQty).toBe(0);
    expect(p.reportedMembers).toBe(0);
  });

  it("ignores actuals linked to a different plan", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-A", output_qty: "440", reversed: false, from_plan_id: "other-plan" },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.members[0].reported).toBe(false);
    expect(p.reportedMembers).toBe(0);
  });

  it("trusts server-side filtering when from_plan_id is absent on the row", () => {
    const actuals: CoverageActual[] = [
      { item_id: "SKU-B", output_qty: "120", reversed: false },
    ];
    const p = computeBatchProgress(manifest2, actuals, PLAN);
    expect(p.members[1].reported).toBe(true);
    expect(p.members[1].reportedQty).toBe(120);
  });

  it("handles an empty manifest without throwing", () => {
    const p = computeBatchProgress([], [], PLAN);
    expect(p.totalMembers).toBe(0);
    expect(p.allReported).toBe(false); // no members ⇒ not 'all reported'
    expect(p.nextUnreportedItemId).toBeNull();
  });
});
