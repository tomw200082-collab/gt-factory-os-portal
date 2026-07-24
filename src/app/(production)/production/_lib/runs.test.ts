import { describe, expect, it } from "vitest";

import {
  autoForwardRunId,
  isRunActive,
  isRunTerminal,
  planRuns,
  runDisplayName,
  runStatusMeta,
  sortRuns,
  stageHeadingKey,
  stageKindKey,
  stepNumber,
} from "./runs";
import type { ProductionRunTodayRow } from "./types";

function run(overrides: Partial<ProductionRunTodayRow> = {}): ProductionRunTodayRow {
  return {
    run_id: "R1",
    plan_id: "P1",
    stage: "TANK",
    item_id: "I1",
    item_name: "Base mix",
    base_bom_head_id: null,
    target_qty: "200",
    uom: "L",
    status: "PLANNED",
    unplanned: false,
    order_index: 0,
    ...overrides,
  };
}

describe("sortRuns — work order", () => {
  it("orders by order_index ascending (tank → fill A → fill B)", () => {
    const rows = [
      run({ run_id: "fillB", order_index: 2 }),
      run({ run_id: "tank", order_index: 0 }),
      run({ run_id: "fillA", order_index: 1 }),
    ];
    expect(sortRuns(rows).map((r) => r.run_id)).toEqual(["tank", "fillA", "fillB"]);
  });

  it("breaks ties stably on run_id", () => {
    const rows = [
      run({ run_id: "b", order_index: 5 }),
      run({ run_id: "a", order_index: 5 }),
    ];
    expect(sortRuns(rows).map((r) => r.run_id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [run({ run_id: "b", order_index: 1 }), run({ run_id: "a", order_index: 0 })];
    const before = rows.map((r) => r.run_id);
    sortRuns(rows);
    expect(rows.map((r) => r.run_id)).toEqual(before);
  });

  it("stepNumber is 1-based", () => {
    expect(stepNumber(0)).toBe(1);
    expect(stepNumber(2)).toBe(3);
  });
});

describe("stage identity", () => {
  it("maps each stage to its kind + heading copy key", () => {
    expect(stageKindKey("TANK")).toBe("run_tank_kind");
    expect(stageKindKey("PACK")).toBe("run_fill_kind");
    expect(stageKindKey("SINGLE")).toBe("run_single_kind");
    expect(stageHeadingKey("TANK")).toBe("pick_tank_heading");
    expect(stageHeadingKey("PACK")).toBe("pick_pack_heading");
    expect(stageHeadingKey("SINGLE")).toBe("pick_both_heading");
  });
});

describe("status mapping + lifecycle", () => {
  it("maps every status to a tone + label", () => {
    expect(runStatusMeta("PLANNED").labelKey).toBe("run_status_todo");
    expect(runStatusMeta("PICKING").tone).toBe("info");
    expect(runStatusMeta("IN_PRODUCTION").tone).toBe("warning");
    expect(runStatusMeta("REPORTED").tone).toBe("success");
    expect(runStatusMeta("CANCELLED").tone).toBe("muted");
  });

  it("treats PICKING + IN_PRODUCTION as active (corrections apply)", () => {
    expect(isRunActive("PICKING")).toBe(true);
    expect(isRunActive("IN_PRODUCTION")).toBe(true);
    expect(isRunActive("PLANNED")).toBe(false);
    expect(isRunActive("REPORTED")).toBe(false);
  });

  it("treats REPORTED + CANCELLED as terminal", () => {
    expect(isRunTerminal("REPORTED")).toBe(true);
    expect(isRunTerminal("CANCELLED")).toBe(true);
    expect(isRunTerminal("PLANNED")).toBe(false);
  });
});

describe("runDisplayName — floor_name forward-compat", () => {
  it("prefers floor_name when present", () => {
    expect(runDisplayName({ floor_name: "Big Tank 2", item_name: "Base mix" })).toBe(
      "Big Tank 2",
    );
  });

  it("falls back to item_name when floor_name is absent/blank", () => {
    expect(runDisplayName({ item_name: "Base mix" })).toBe("Base mix");
    expect(runDisplayName({ floor_name: "   ", item_name: "Base mix" })).toBe("Base mix");
    expect(runDisplayName({ floor_name: null, item_name: "Base mix" })).toBe("Base mix");
  });
});

// ---------------------------------------------------------------------------
// Tranche 147 — the plan card links to /production?plan=…&report=1, so these
// two helpers decide whether the operator lands on a report form or a list.
// Getting autoForwardRunId wrong reports the wrong product, so its "when NOT
// to forward" cases matter more than the happy path.
// ---------------------------------------------------------------------------
describe("planRuns — scoping the day to one plan", () => {
  it("keeps only the runs of the given plan", () => {
    const rows = [
      run({ run_id: "a", plan_id: "P1" }),
      run({ run_id: "b", plan_id: "P2" }),
      run({ run_id: "c", plan_id: "P1" }),
    ];
    expect(planRuns(rows, "P1").map((r) => r.run_id)).toEqual(["a", "c"]);
  });

  it("returns everything when no plan is given", () => {
    const rows = [run({ run_id: "a" }), run({ run_id: "b", plan_id: "P2" })];
    expect(planRuns(rows, null)).toHaveLength(2);
    expect(planRuns(rows, "")).toHaveLength(2);
  });

  it("never mutates its input", () => {
    const rows = [run({ run_id: "a", plan_id: "P1" }), run({ run_id: "b", plan_id: "P2" })];
    planRuns(rows, "P1");
    expect(rows).toHaveLength(2);
  });

  it("an unplanned (plan_id null) run is not swept into a plan's scope", () => {
    const rows = [run({ run_id: "a", plan_id: "P1" }), run({ run_id: "x", plan_id: null })];
    expect(planRuns(rows, "P1").map((r) => r.run_id)).toEqual(["a"]);
  });
});

describe("autoForwardRunId — only an unambiguous single target", () => {
  it("forwards when the plan has exactly one reportable run", () => {
    expect(autoForwardRunId([run({ run_id: "only", status: "PLANNED" })])).toBe("only");
  });

  it("forwards a run that was never picked — back-dated reporting must work", () => {
    expect(autoForwardRunId([run({ run_id: "r", status: "PLANNED" })])).toBe("r");
  });

  it("forwards mid-production too", () => {
    expect(autoForwardRunId([run({ run_id: "r", status: "IN_PRODUCTION" })])).toBe("r");
  });

  it("does NOT forward a base batch — tank + packs would report the wrong product", () => {
    const rows = [
      run({ run_id: "tank", stage: "TANK" }),
      run({ run_id: "packA", stage: "PACK" }),
      run({ run_id: "packB", stage: "PACK" }),
    ];
    expect(autoForwardRunId(rows)).toBeNull();
  });

  it("does NOT forward when nothing is left to report", () => {
    expect(autoForwardRunId([run({ status: "REPORTED" })])).toBeNull();
    expect(autoForwardRunId([run({ status: "CANCELLED" })])).toBeNull();
    expect(autoForwardRunId([])).toBeNull();
  });

  it("ignores finished runs when finding the single remaining target", () => {
    const rows = [
      run({ run_id: "done", status: "REPORTED" }),
      run({ run_id: "left", status: "IN_PRODUCTION" }),
    ];
    expect(autoForwardRunId(rows)).toBe("left");
  });
});
