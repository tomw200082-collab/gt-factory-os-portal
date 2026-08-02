// ---------------------------------------------------------------------------
// Conflict-code → operator message.
//
// The backend's 409 body carries `reason_code` plus a `detail` string composed
// for a log: it contains run UUIDs ("production_run 7d1dc63c-… not found") and
// status enums ("status=IN_PRODUCTION is not pickable"). portal_ux_standard.md
// §1 forbids both in primary UI, and neither means anything to a weak English
// reader standing at a tank. Before tranche 158 every unmapped code threw
// `detail` straight into the operator's banner.
//
// So `detail` is never rendered. Each code this corridor can receive resolves
// to a dict key here, and anything unrecognised — a code added backend-side
// after this file was written — falls to `error_generic`, which is vague but
// safe and still tells the operator what to do next.
//
// STALE_BOM_VERSION / STALE_BASE_BOM_VERSION are deliberately absent: the
// callers detect them by sentinel before consulting this map, because they
// drive their own banner with a reload action rather than a plain message.
// ---------------------------------------------------------------------------

import type { PickingDictKey } from "./copy";

/** Mirrors `ProductionRunConflictReason` in api/src/production-runs/schemas.ts.
 *  Kept as a plain record rather than a typed Record<Reason, …> because the
 *  portal never imports from the backend tree, and a code that only exists
 *  upstream must degrade rather than fail to compile. */
const CONFLICT_COPY: Readonly<Record<string, PickingDictKey>> = {
  RUN_NOT_FOUND: "err_run_not_found",
  RUN_NOT_PICKABLE: "err_run_not_pickable",
  RUN_ALREADY_REPORTED: "report_err_already",
  RUN_CANCELLED: "err_run_cancelled",
  RUN_NOT_REPORTABLE: "report_err_not_reportable",

  // The product on the run is unusable — always a planner fix, never
  // something the operator can resolve by retrying.
  ITEM_NOT_FOUND: "err_product_problem",
  ITEM_INACTIVE: "err_product_problem",
  WRONG_SUPPLY_METHOD: "err_product_problem",
  UOM_MISMATCH: "err_product_problem",

  // Every flavour of "this job has no usable recipe". The operator does not
  // need to know which of the nine ways it is broken, only who fixes it.
  NO_BOM_HEAD: "err_recipe_missing",
  NO_ACTIVE_BOM_VERSION: "err_recipe_missing",
  NO_ACTIVE_BASE_BOM_VERSION: "err_recipe_missing",
  NO_BOM_LINES: "err_recipe_missing",
  NO_BASE_BOM_LINES: "err_recipe_missing",
  MULTIPLE_BASE_BOM_LINES: "err_recipe_missing",
  BASE_BOM_LINE_QTY_NULL: "err_recipe_missing",
  BASE_BOM_LINE_UOM_MISMATCH: "err_recipe_missing",
  BASE_BOM_LINKAGE_INCONSISTENT: "err_recipe_missing",

  COMPONENT_NOT_FOUND: "err_material_missing",
  IDEMPOTENCY_KEY_REUSED: "err_already_sent",
};

/** The dict key for a conflict code. Unknown / missing → `error_generic`. */
export function conflictCopyKey(code: string | null | undefined): PickingDictKey {
  if (!code) return "error_generic";
  return CONFLICT_COPY[code] ?? "error_generic";
}

/** True when the code is one of the stale-recipe pair the callers handle with
 *  their own reload banner. Substring match because the two codes share the
 *  prefix and the backend has added a `STALE_`-prefixed variant before. */
export function isStaleCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code.includes("STALE");
}
