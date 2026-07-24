// ---------------------------------------------------------------------------
// Run-list pure logic — ordering, stage identity, status mapping, display name.
//
// No React, no I/O, no Date — fully deterministic so it is unit-testable and
// the RunList component stays a thin renderer over these helpers.
// ---------------------------------------------------------------------------

import type { PickingDictKey } from "./copy";
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

/** Copy key for the stage's short kind label (Make tank / Fill / Make & fill). */
export function stageKindKey(stage: ProductionStage): PickingDictKey {
  switch (stage) {
    case "TANK":
      return "run_tank_kind";
    case "PACK":
      return "run_fill_kind";
    case "SINGLE":
      return "run_single_kind";
  }
}

/** Copy key for the picking-screen heading, driven by stage. */
export function stageHeadingKey(stage: ProductionStage): PickingDictKey {
  switch (stage) {
    case "TANK":
      return "pick_tank_heading";
    case "PACK":
      return "pick_pack_heading";
    case "SINGLE":
      return "pick_both_heading";
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
 *  item name (tranche-142 forward-compat — see types.ts). */
export function runDisplayName(row: {
  floor_name?: string | null;
  item_name: string;
}): string {
  return row.floor_name?.trim() || row.item_name;
}
