// ---------------------------------------------------------------------------
// Run-list pure logic — ordering, stage identity, status mapping, display name.
//
// No React, no I/O, no Date — fully deterministic so it is unit-testable and
// the RunList component stays a thin renderer over these helpers.
// ---------------------------------------------------------------------------

import { t, type PickingDictKey } from "./copy";
import type {
  ProductionRunStatus,
  ProductionRunTodayRow,
  ProductionStage,
} from "./types";

/** Today's runs in work order: "make tank → fill A → fill B". Sorted by the
 *  backend `order_index`; ties break on run_id so the order is stable. Pure —
 *  returns a new array, never mutates the input. */
export function sortRuns(
  rows: readonly ProductionRunTodayRow[],
): ProductionRunTodayRow[] {
  return [...rows].sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return a.run_id.localeCompare(b.run_id);
  });
}

/** 1-based step number for a run at sorted position `index`. */
export function stepNumber(index: number): number {
  return index + 1;
}

/** The runs belonging to one production plan, in the given order. A null/empty
 *  `planId` means "no scope" and returns the list untouched. Pure. */
export function planRuns(
  rows: readonly ProductionRunTodayRow[],
  planId: string | null | undefined,
): ProductionRunTodayRow[] {
  if (!planId) return [...rows];
  return rows.filter((r) => r.plan_id === planId);
}

/** Whether a run can be reported at all.
 *
 *  A TANK run makes liquid for other runs to fill — it has no finished product
 *  of its own, so the backend answers RUN_NOT_REPORTABLE for it (its liquids
 *  are consumed when the plan's first PACK run is reported). Everything else
 *  non-terminal is reportable, including a run nobody collected for: reporting
 *  after the fact must not depend on having picked first. */
export function isRunReportable(row: {
  status: ProductionRunStatus;
  stage: ProductionStage;
}): boolean {
  return !isRunTerminal(row.status) && row.stage !== "TANK";
}

/** The run to open the report form on directly, or null to show the list.
 *
 *  Only an unambiguous single target auto-forwards: exactly one run that can
 *  actually be reported. A base batch (tank + one run per pack SKU) has
 *  several, so the operator chooses — silently picking one of them would
 *  report the wrong product. An already-reported run does not count as a
 *  target: a plan whose only run is done should land on the list showing it
 *  done, not on a form that refuses. Nor does a lone TANK run, which would
 *  forward straight into a 409. Pure. */
export function autoForwardRunId(
  rows: readonly ProductionRunTodayRow[],
): string | null {
  const reportable = rows.filter(isRunReportable);
  return reportable.length === 1 ? reportable[0].run_id : null;
}

/** Copy key for the stage's short kind label (Make tank / Fill / Make & fill).
 *  An unexpected stage falls back to the "both" kind so a bad value never
 *  produces `t(undefined)` → a thrown render (A11Y-006). The `never` assertion
 *  makes a future stage a compile error, not a runtime crash. */
export function stageKindKey(stage: ProductionStage): PickingDictKey {
  switch (stage) {
    case "TANK":
      return "run_tank_kind";
    case "PACK":
      return "run_fill_kind";
    case "SINGLE":
      return "run_single_kind";
    default: {
      const _exhaustive: never = stage;
      void _exhaustive;
      return "run_single_kind";
    }
  }
}

/** Copy key for the picking-screen heading, driven by stage. Same safe-default
 *  discipline as stageKindKey — an unknown stage yields the "both" heading
 *  rather than crashing the picking screen. */
export function stageHeadingKey(stage: ProductionStage): PickingDictKey {
  switch (stage) {
    case "TANK":
      return "pick_tank_heading";
    case "PACK":
      return "pick_pack_heading";
    case "SINGLE":
      return "pick_both_heading";
    default: {
      const _exhaustive: never = stage;
      void _exhaustive;
      return "pick_both_heading";
    }
  }
}

export type RunStatusTone = "neutral" | "info" | "warning" | "success" | "muted";

export interface RunStatusMeta {
  tone: RunStatusTone;
  labelKey: PickingDictKey;
}

const STATUS_META: Record<ProductionRunStatus, RunStatusMeta> = {
  PLANNED: { tone: "neutral", labelKey: "run_status_todo" },
  PICKING: { tone: "info", labelKey: "run_status_picking" },
  IN_PRODUCTION: { tone: "warning", labelKey: "run_status_making" },
  REPORTED: { tone: "success", labelKey: "run_status_done" },
  CANCELLED: { tone: "muted", labelKey: "run_status_cancelled" },
};

export function runStatusMeta(status: ProductionRunStatus): RunStatusMeta {
  return STATUS_META[status];
}

/** A run is "active" — Add-material / Return corrections apply — once it is in
 *  the picking or in-production phase, but not before it starts or after it is
 *  reported/cancelled. */
export function isRunActive(status: ProductionRunStatus): boolean {
  return status === "PICKING" || status === "IN_PRODUCTION";
}

/** A terminal run cannot be opened for picking (reported or cancelled). */
export function isRunTerminal(status: ProductionRunStatus): boolean {
  return status === "REPORTED" || status === "CANCELLED";
}

/** Big display name for a run: floor name if the backend has one yet, else the
 *  item name (tranche-142 forward-compat — see types.ts).
 *
 *  A TANK run has no item, so both can be absent; falling through to the raw
 *  value would print "null" on the operator's screen. */
export function runDisplayName(row: {
  floor_name?: string | null;
  item_name?: string | null;
}): string {
  return row.floor_name?.trim() || row.item_name?.trim() || t("run_base_batch_name");
}
