// Tranche 048 — unit tests for the production-plan board pack pure logic.
import { describe, expect, it } from "vitest";
import {
  buildUomOptions,
  computeTodaySummary,
  fmtUpdatedTime,
  groupFieldErrors,
} from "./board-summary";
import type { ProductionPlanRow, RenderedState } from "./types";

// Minimal row factory — only fields the helpers read are meaningful.
function row(overrides: Partial<ProductionPlanRow>): ProductionPlanRow {
  return {
    plan_id: "p-1",
    plan_type: "production",
    plan_date: "2026-06-11",
    item_id: "item-1",
    item_name: "Margarita Mix",
    item_supply_method: "MANUFACTURED",
    planned_qty: "100",
    uom: "L",
    status: "planned",
    rendered_state: "planned" as RenderedState,
    base_bom_head_id: null,
    is_base_batch: false,
    pack_manifest_count: 0,
    source_recommendation_id: null,
    source_run_id: null,
    source_run_status: null,
    source_recommendation_qty: null,
    bom_version_id_pinned: null,
    bom_version_label: null,
    notes: null,
    created_by_user_id: "u-1",
    created_by_snapshot: "Tester",
    created_at: "2026-06-11T08:00:00Z",
    updated_at: "2026-06-11T08:00:00Z",
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: null,
    completed_actual: null,
    ...overrides,
  };
}

const TODAY = "2026-06-11";
const TOMORROW = "2026-06-12";

describe("buildUomOptions", () => {
  it("lists present uoms first, then the known set, deduped", () => {
    const out = buildUomOptions(["BOTTLE", "L", "BOTTLE", null], ["KG", "L", "UNIT"]);
    expect(out).toEqual(["BOTTLE", "L", "KG", "UNIT"]);
  });

  it("falls back to the contract UOMS seed when no rows are present", () => {
    const out = buildUomOptions([]);
    expect(out).toContain("KG");
    expect(out).toContain("L");
    expect(out).toContain("UNIT");
    expect(out).toContain("BOTTLE");
    // no duplicates
    expect(new Set(out).size).toBe(out.length);
  });

  it("ignores empty / whitespace-only uoms", () => {
    const out = buildUomOptions(["", "  ", undefined, "ML"], ["KG"]);
    expect(out).toEqual(["ML", "KG"]);
  });
});

describe("computeTodaySummary", () => {
  it("counts planned / reported / unreported for today's lane only", () => {
    const rows = [
      row({ plan_id: "a", plan_date: TODAY, rendered_state: "planned" }),
      row({ plan_id: "b", plan_date: TODAY, rendered_state: "done" }),
      row({ plan_id: "c", plan_date: TODAY, rendered_state: "cancelled" }),
      row({ plan_id: "d", plan_date: "2026-06-10", rendered_state: "planned" }),
    ];
    const s = computeTodaySummary(rows, TODAY, TOMORROW);
    expect(s.todayPlanned).toBe(2); // a + b; cancelled excluded
    expect(s.todayReported).toBe(1);
    expect(s.todayUnreported).toBe(1);
    expect(s.unreportedTodayPlans.map((p) => p.plan_id)).toEqual(["a"]);
  });

  it("excludes note rows from every count", () => {
    const rows = [
      row({ plan_id: "n", plan_type: "note", plan_date: TODAY, planned_qty: null, uom: null }),
      row({ plan_id: "a", plan_date: TODAY }),
    ];
    const s = computeTodaySummary(rows, TODAY, TOMORROW);
    expect(s.todayPlanned).toBe(1);
    expect(s.todayUnreported).toBe(1);
  });

  it("builds the tomorrow preview: job count, unit sum, uniform uom", () => {
    const rows = [
      row({ plan_id: "t1", plan_date: TOMORROW, planned_qty: "40", uom: "L" }),
      row({ plan_id: "t2", plan_date: TOMORROW, planned_qty: "2.5", uom: "L" }),
      row({ plan_id: "t3", plan_date: TOMORROW, planned_qty: "10", uom: "L", rendered_state: "cancelled" }),
    ];
    const s = computeTodaySummary(rows, TODAY, TOMORROW);
    expect(s.tomorrowJobs).toBe(2);
    expect(s.tomorrowUnits).toBeCloseTo(42.5);
    expect(s.tomorrowUom).toBe("L");
  });

  it("returns null tomorrowUom when units are mixed", () => {
    const rows = [
      row({ plan_id: "t1", plan_date: TOMORROW, planned_qty: "40", uom: "L" }),
      row({ plan_id: "t2", plan_date: TOMORROW, planned_qty: "6", uom: "KG" }),
    ];
    const s = computeTodaySummary(rows, TODAY, TOMORROW);
    expect(s.tomorrowJobs).toBe(2);
    expect(s.tomorrowUnits).toBe(46);
    expect(s.tomorrowUom).toBeNull();
  });

  it("treats unparsable quantities as zero instead of NaN-poisoning the sum", () => {
    const rows = [
      row({ plan_id: "t1", plan_date: TOMORROW, planned_qty: "40" }),
      row({ plan_id: "t2", plan_date: TOMORROW, planned_qty: null }),
    ];
    const s = computeTodaySummary(rows, TODAY, TOMORROW);
    expect(s.tomorrowUnits).toBe(40);
  });

  it("returns all-zero summary for an empty week", () => {
    const s = computeTodaySummary([], TODAY, TOMORROW);
    expect(s).toEqual({
      todayPlanned: 0,
      todayReported: 0,
      todayUnreported: 0,
      unreportedTodayPlans: [],
      tomorrowJobs: 0,
      tomorrowUnits: 0,
      tomorrowUom: null,
    });
  });
});

describe("groupFieldErrors", () => {
  const FIELDS = ["plan_date", "item_id", "planned_qty", "uom", "notes"];

  it("buckets messages by first path segment for known fields", () => {
    const grouped = groupFieldErrors(
      [
        { path: ["planned_qty"], message: "must be greater than 0" },
        { path: ["uom"], message: "unknown unit" },
        { path: ["planned_qty"], message: "too many decimals" },
      ],
      FIELDS,
    );
    expect(grouped.byField.planned_qty).toEqual([
      "must be greater than 0",
      "too many decimals",
    ]);
    expect(grouped.byField.uom).toEqual(["unknown unit"]);
    expect(grouped.general).toEqual([]);
  });

  it("routes unknown / pathless errors to general without dropping them", () => {
    const grouped = groupFieldErrors(
      [
        { path: ["idempotency_key"], message: "invalid" },
        { path: [], message: "request malformed" },
        { message: "boom" },
      ],
      FIELDS,
    );
    expect(grouped.byField).toEqual({});
    expect(grouped.general).toEqual([
      "idempotency_key: invalid",
      "request malformed",
      "boom",
    ]);
  });

  it("skips empty messages", () => {
    const grouped = groupFieldErrors(
      [{ path: ["uom"], message: "  " }, { path: ["uom"] }],
      FIELDS,
    );
    expect(grouped.byField).toEqual({});
    expect(grouped.general).toEqual([]);
  });
});

describe("fmtUpdatedTime", () => {
  it("formats as zero-padded HH:MM", () => {
    const d = new Date(2026, 5, 11, 9, 5, 0); // local time
    expect(fmtUpdatedTime(d.getTime())).toBe("09:05");
  });

  it("returns empty string for invalid input", () => {
    expect(fmtUpdatedTime(0)).toBe("");
    expect(fmtUpdatedTime(NaN)).toBe("");
    expect(fmtUpdatedTime(-5)).toBe("");
  });
});
