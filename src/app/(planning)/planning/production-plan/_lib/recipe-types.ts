// Per-plan recipe override ("improvised liquid recipe") portal types —
// mirror of gt-factory-os/api/src/plan-recipe/schemas.ts (0237).
// The portal does not import from the backend tree; drift is a bug.
//
// All quantities are PER OUTPUT UNIT of the plan's FG item, serialized as
// text to preserve qty_8dp precision.

// ---------------------------------------------------------------------------
// GET /api/production-plan/[plan_id]/recipe
// ---------------------------------------------------------------------------

export interface PlanRecipeLiquidLine {
  component_id: string;
  component_name: string | null;
  /** Effective qty per single FG output unit (override qty when customized). */
  qty_per_unit: string;
  uom: string;
  /** Current on-hand from current_balances ('0' when none). */
  available_qty: string;
  /** Standard-tree qty per output unit; NULL = added by the override. */
  standard_qty_per_unit: string | null;
  in_standard: boolean;
}

export interface PlanRecipeRemovedLine {
  component_id: string;
  component_name: string | null;
  standard_qty_per_unit: string;
  uom: string | null;
}

export interface PlanRecipeResponse {
  plan_id: string;
  item_id: string;
  item_name: string | null;
  planned_qty: string;
  uom: string;
  status: string;
  /** true when an override row exists for this plan. */
  customized: boolean;
  override_id: string | null;
  note: string | null;
  base_bom_head_id: string | null;
  base_bom_version_id: string | null;
  /** BASE version snapshotted at override-author time (drift detection). */
  override_base_bom_version_id: string | null;
  liquid_lines: PlanRecipeLiquidLine[];
  /** Standard liquid components dropped by the override. */
  removed_standard_lines: PlanRecipeRemovedLine[];
}

// ---------------------------------------------------------------------------
// PUT /api/production-plan/[plan_id]/recipe — full replacement liquid set.
// lines:[] clears the override (≡ DELETE).
// ---------------------------------------------------------------------------

export interface PlanRecipeOverrideLine {
  component_id: string;
  qty_per_output_unit: number;
  uom: string;
}

export interface PutPlanRecipeRequest {
  idempotency_key: string;
  lines: PlanRecipeOverrideLine[];
  note?: string | null;
}

export interface PutPlanRecipeResponse {
  plan_id: string;
  action: "set" | "cleared";
  changed: boolean;
  override_id: string | null;
  line_count: number;
  base_bom_version_id: string | null;
  idempotent_replay: boolean;
}

export interface DeletePlanRecipeResponse {
  plan_id: string;
  cleared: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/production-plan/recipe-overrides/last?item_id=
// ---------------------------------------------------------------------------

export interface LastOverrideResponse {
  item_id: string;
  found: boolean;
  override: {
    override_id: string;
    plan_id: string;
    plan_date: string; // YYYY-MM-DD
    base_bom_version_id: string | null;
    note: string | null;
    updated_at: string; // ISO
    lines: Array<{
      component_id: string;
      component_name: string | null;
      qty_per_output_unit: string;
      uom: string;
    }>;
  } | null;
}

// ---------------------------------------------------------------------------
// Conflicts (409 body)
// ---------------------------------------------------------------------------

export type PlanRecipeConflictReason =
  | "PLAN_NOT_FOUND"
  | "PLAN_IS_NOTE"
  | "PLAN_NOT_EDITABLE"
  | "ITEM_NOT_MANUFACTURED"
  | "NO_LIQUID_RECIPE"
  | "COMPONENT_NOT_FOUND"
  | "COMPONENT_IS_PACKAGING"
  | "DUPLICATE_COMPONENT"
  | "UOM_UNKNOWN"
  | "IDEMPOTENCY_KEY_REUSED"
  | "BOM_CONTEXT_UNRESOLVED";

export interface PlanRecipeConflictResponse {
  reason_code: PlanRecipeConflictReason;
  detail: string;
  offending_field?: string;
}
