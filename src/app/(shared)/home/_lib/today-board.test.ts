import { describe, expect, it } from "vitest";
import type { ProductionPlanRow } from "@/app/(planning)/planning/production-plan/_lib/types";
import type { FlowItem } from "@/app/(planning)/planning/inventory-flow/_lib/types";
import {
  addDaysIso,
  bucketArrivals,
  buildTodayPlan,
  buildTomorrowTiers,
  buildYesterdayCreditsSummary,
  buildYesterdayPlanVsActual,
  findUnmatchedActuals,
  PLAN_STATUS_LABEL,
  type CreditTrackingRowLite,
  type ProductionActualHistoryRow,
  type PurchaseOrderRowLite,
} from "./today-board";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function plan(overrides: Partial<ProductionPlanRow>): ProductionPlanRow {
  return {
    plan_id: "plan-1",
    plan_type: "production",
    plan_date: "2026-07-22",
    item_id: "item-1",
    item_name: "Mojito Mix",
    item_supply_method: "MANUFACTURED",
    planned_qty: "100",
    uom: "L",
    status: "planned",
    rendered_state: "planned",
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
    created_by_user_id: "u1",
    created_by_snapshot: "Tom",
    created_at: "2026-07-22T06:00:00Z",
    updated_at: "2026-07-22T06:00:00Z",
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

function actual(overrides: Partial<ProductionActualHistoryRow>): ProductionActualHistoryRow {
  return {
    submission_id: "sub-1",
    item_id: "item-1",
    item_name: "Mojito Mix",
    output_qty: "95",
    scrap_qty: "2",
    output_uom: "L",
    event_at: "2026-07-22T14:00:00Z",
    reversed: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addDaysIso
// ---------------------------------------------------------------------------

describe("addDaysIso", () => {
  it("adds a day", () => {
    expect(addDaysIso("2026-07-22", 1)).toBe("2026-07-23");
  });
  it("subtracts a day", () => {
    expect(addDaysIso("2026-07-22", -1)).toBe("2026-07-21");
  });
  it("crosses a month boundary", () => {
    expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("returns the input unchanged for an unparseable date", () => {
    expect(addDaysIso("not-a-date", 1)).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// buildYesterdayPlanVsActual
// ---------------------------------------------------------------------------

describe("buildYesterdayPlanVsActual", () => {
  it("joins a linked plan to its actual via completed_submission_id", () => {
    const rows = buildYesterdayPlanVsActual(
      [plan({ plan_id: "p1", completed_submission_id: "sub-1" })],
      [actual({ submission_id: "sub-1", output_qty: "95" })],
      "2026-07-22",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].no_report).toBe(false);
    expect(rows[0].actual?.output_qty).toBe(95);
  });

  it("flags a firmed (planned) day with no linked report as no_report FIRST", () => {
    const rows = buildYesterdayPlanVsActual(
      [
        plan({ plan_id: "p1", completed_submission_id: "sub-1" }),
        plan({ plan_id: "p2", status: "planned", completed_submission_id: null }),
      ],
      [actual({ submission_id: "sub-1" })],
      "2026-07-22",
    );
    expect(rows[0].plan_id).toBe("p2");
    expect(rows[0].no_report).toBe(true);
    expect(rows[0].actual).toBeNull();
    expect(rows[1].no_report).toBe(false);
  });

  it("does not flag a draft plan (never firmed)", () => {
    const rows = buildYesterdayPlanVsActual(
      [plan({ status: "draft", completed_submission_id: null })],
      [],
      "2026-07-22",
    );
    expect(rows[0].no_report).toBe(false);
  });

  it("does not flag a cancelled plan", () => {
    const rows = buildYesterdayPlanVsActual(
      [plan({ status: "cancelled", completed_submission_id: null })],
      [],
      "2026-07-22",
    );
    expect(rows[0].no_report).toBe(false);
  });

  it("falls back to the plan's embedded completed_actual when the submission is outside the fetched history window", () => {
    const rows = buildYesterdayPlanVsActual(
      [
        plan({
          completed_submission_id: "sub-9",
          completed_actual: {
            submission_id: "sub-9",
            event_at: "2026-07-22T14:00:00Z",
            output_qty: "88",
            scrap_qty: "1",
            output_uom: "L",
            variance_qty: "-12",
            variance_pct: "-12",
          },
        }),
      ],
      [], // history fetch didn't include sub-9
      "2026-07-22",
    );
    expect(rows[0].no_report).toBe(false);
    expect(rows[0].actual?.output_qty).toBe(88);
    expect(rows[0].actual?.variance_pct).toBe(-12);
  });

  it("excludes plan_type notes and other-day rows", () => {
    const rows = buildYesterdayPlanVsActual(
      [
        plan({ plan_type: "note", plan_date: "2026-07-22" }),
        plan({ plan_date: "2026-07-21" }),
      ],
      [],
      "2026-07-22",
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findUnmatchedActuals
// ---------------------------------------------------------------------------

describe("findUnmatchedActuals", () => {
  it("returns actuals not linked from any plan's completed_submission_id", () => {
    const rows = findUnmatchedActuals(
      [plan({ completed_submission_id: "sub-1" })],
      [actual({ submission_id: "sub-1" }), actual({ submission_id: "sub-2" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].submission_id).toBe("sub-2");
  });

  it("excludes reversed submissions even when unmatched", () => {
    const rows = findUnmatchedActuals(
      [],
      [actual({ submission_id: "sub-2", reversed: true })],
    );
    expect(rows).toHaveLength(0);
  });

  it("returns nothing when every actual is linked", () => {
    const rows = findUnmatchedActuals(
      [plan({ completed_submission_id: "sub-1" })],
      [actual({ submission_id: "sub-1" })],
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildYesterdayCreditsSummary
// ---------------------------------------------------------------------------

describe("buildYesterdayCreditsSummary", () => {
  const rows: CreditTrackingRowLite[] = [
    { credit_task_id: "c1", created_at: "2026-07-22T09:00:00Z", status: "PENDING", qty_missing: 3 },
    { credit_task_id: "c2", created_at: "2026-07-22T10:00:00Z", status: "CREDITED", qty_missing: 2 },
    { credit_task_id: "c3", created_at: "2026-07-21T09:00:00Z", status: "PENDING", qty_missing: 5 },
  ];

  it("filters to the given day and sums qty_missing", () => {
    const summary = buildYesterdayCreditsSummary(rows, "2026-07-22");
    expect(summary.count).toBe(2);
    expect(summary.totalQtyMissing).toBe(5);
    expect(summary.byStatus).toEqual({ PENDING: 1, CREDITED: 1 });
  });

  it("returns a zeroed summary for a day with no rows", () => {
    const summary = buildYesterdayCreditsSummary(rows, "2026-01-01");
    expect(summary.count).toBe(0);
    expect(summary.totalQtyMissing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildTodayPlan
// ---------------------------------------------------------------------------

describe("buildTodayPlan", () => {
  it("includes only today's production rows, and marks locked vs draft", () => {
    const rows = buildTodayPlan(
      [
        plan({ plan_id: "p1", plan_date: "2026-07-22", status: "planned" }),
        plan({ plan_id: "p2", plan_date: "2026-07-22", status: "draft" }),
        plan({ plan_id: "p3", plan_date: "2026-07-21", status: "planned" }),
        plan({ plan_id: "p4", plan_date: "2026-07-22", plan_type: "note" }),
      ],
      "2026-07-22",
    );
    expect(rows.map((r) => r.plan_id)).toEqual(["p1", "p2"]);
    expect(rows[0].locked).toBe(true);
    expect(rows[1].locked).toBe(false);
  });
});

describe("PLAN_STATUS_LABEL", () => {
  it("has plain-English copy for every status, matching the Daily Production Plan board's draft wording", () => {
    expect(PLAN_STATUS_LABEL.draft).toBe("Draft — not yet locked");
    expect(PLAN_STATUS_LABEL.in_production).toBe("In production");
  });
});

// ---------------------------------------------------------------------------
// bucketArrivals
// ---------------------------------------------------------------------------

describe("bucketArrivals", () => {
  const po = (o: Partial<PurchaseOrderRowLite>): PurchaseOrderRowLite => ({
    po_id: "po-1",
    po_number: "PO-0001",
    supplier_name: "Acme",
    status: "OPEN",
    expected_receive_date: "2026-07-22",
    ...o,
  });

  it("buckets today vs overdue and excludes future dates", () => {
    const { today, overdue } = bucketArrivals(
      [
        po({ po_id: "a", expected_receive_date: "2026-07-22" }),
        po({ po_id: "b", expected_receive_date: "2026-07-20" }),
        po({ po_id: "c", expected_receive_date: "2026-07-25" }),
      ],
      "2026-07-22",
    );
    expect(today.map((r) => r.po_id)).toEqual(["a"]);
    expect(overdue.map((r) => r.po_id)).toEqual(["b"]);
  });

  it("excludes POs with no expected_receive_date rather than guessing", () => {
    const { today, overdue } = bucketArrivals(
      [po({ po_id: "a", expected_receive_date: null })],
      "2026-07-22",
    );
    expect(today).toHaveLength(0);
    expect(overdue).toHaveLength(0);
  });

  it("sorts overdue oldest-expected first", () => {
    const { overdue } = bucketArrivals(
      [
        po({ po_id: "a", expected_receive_date: "2026-07-19" }),
        po({ po_id: "b", expected_receive_date: "2026-07-21" }),
      ],
      "2026-07-22",
    );
    expect(overdue.map((r) => r.po_id)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// buildTomorrowTiers
// ---------------------------------------------------------------------------

describe("buildTomorrowTiers", () => {
  function flowDay(overrides: Record<string, unknown>) {
    return {
      day: "2026-07-23",
      is_working_day: true,
      holiday_name_he: null,
      demand_lionwheel: 10,
      demand_forecast: 5,
      incoming_supply: 0,
      projected_on_hand_eod: 20,
      inflow_from_production: 0,
      incoming_supply_combined: 0,
      projected_on_hand_eod_with_production: 20,
      tier: "healthy",
      shortfall_qty: 0,
      shortfall_qty_with_production: 0,
      ...overrides,
    };
  }
  function flowItem(overrides: Record<string, unknown>): FlowItem {
    return {
      item_id: "item-1",
      item_name: "Mojito Mix",
      family: null,
      sku_kind: "ITEM",
      supply_method: "MANUFACTURED",
      risk_tier: "healthy",
      days_of_cover: 10,
      effective_lead_time_days: 3,
      current_on_hand: 50,
      earliest_stockout_date: null,
      days: [flowDay({})],
      weeks: [],
      ...overrides,
    } as FlowItem;
  }

  it("maps a positive shortfall to short, ranked first", () => {
    const rows = buildTomorrowTiers(
      [
        flowItem({ item_id: "ok", item_name: "Healthy Item", days: [flowDay({ shortfall_qty_with_production: 0 })] }),
        flowItem({ item_id: "bad", item_name: "Short Item", days: [flowDay({ shortfall_qty_with_production: 12 })] }),
      ],
      "2026-07-23",
    );
    expect(rows[0].item_id).toBe("bad");
    expect(rows[0].tier).toBe("short");
    expect(rows[0].shortfall_qty).toBe(12);
    expect(rows[1].tier).toBe("ready");
  });

  it("marks a non-working day as non_working, not ready or short", () => {
    const rows = buildTomorrowTiers(
      [flowItem({ days: [flowDay({ is_working_day: false, shortfall_qty_with_production: 0 })] })],
      "2026-07-23",
    );
    expect(rows[0].tier).toBe("non_working");
  });

  it("returns unknown (never ready) when tomorrow is outside the fetched horizon", () => {
    const rows = buildTomorrowTiers(
      [flowItem({ days: [flowDay({ day: "2026-07-24" })] })],
      "2026-07-23",
    );
    expect(rows[0].tier).toBe("unknown");
    expect(rows[0].projected_on_hand).toBeNull();
  });

  it("falls back to shortfall_qty when the production-aware field is absent", () => {
    const rows = buildTomorrowTiers(
      [
        flowItem({
          days: [
            {
              ...flowDay({}),
              shortfall_qty_with_production: undefined as unknown as number,
              shortfall_qty: 4,
            },
          ],
        }),
      ],
      "2026-07-23",
    );
    expect(rows[0].tier).toBe("short");
    expect(rows[0].shortfall_qty).toBe(4);
  });
});
