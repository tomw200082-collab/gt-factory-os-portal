// ---------------------------------------------------------------------------
// Planning Blockers — TypeScript types
//
// Mirrors the W1 DTO contract for GET /api/v1/queries/planning/blockers
// exactly. NO fields invented beyond the contract shape.
//
// Source of truth:
//   gt-factory-os/api/src/planning/schemas.ts
//   (BlockerSeverityValues / BlockerCategoryValues / BlockerLabelKeyValues /
//    FixActionLabelKeyValues / BlockerRow / BlockersRunMeta / BlockersResponse)
//
// Live endpoint shape verified 2026-04-27 against Railway production deploy
// ef03b588 with a real Supabase JWT.
// ---------------------------------------------------------------------------

export const BLOCKER_SEVERITY_VALUES = ["info", "warning", "fail_hard"] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITY_VALUES)[number];

export const BLOCKER_CATEGORY_VALUES = [
  "missing_supplier_mapping",
  "missing_bom",
  "po_substrate_absent_supply_not_netted",
  "recommendation_below_trigger_threshold",
] as const;
export type BlockerCategory = (typeof BLOCKER_CATEGORY_VALUES)[number];

export const BLOCKER_LABEL_KEY_VALUES = [
  "MISSING_SUPPLIER_MAPPING",
  "MISSING_BOM",
  "PO_SUBSTRATE_ABSENT",
  "BELOW_TRIGGER_THRESHOLD",
] as const;
export type BlockerLabelKey = (typeof BLOCKER_LABEL_KEY_VALUES)[number];

export const FIX_ACTION_LABEL_KEY_VALUES = [
  "configure_supplier",
  "configure_bom",
  "check_po_substrate",
  "review_trigger_threshold",
] as const;
export type FixActionLabelKey = (typeof FIX_ACTION_LABEL_KEY_VALUES)[number];

// v1 always emits 'planning_exception'; backend exposes the field today so
// future iterations can switch on it without a portal redeploy.
export type BlockerSource = "planning_exception";

export type BlockerDisplayKind = "item" | "component" | "run_level";

export interface BlockerRow {
  exception_id: string;
  run_id: string;

  // Element 1 — what is blocked (NEVER show a UUID as primary id; W1 normalizes).
  display_id: string | null;
  display_name: string | null;
  display_kind: BlockerDisplayKind;
  item_id: string | null;
  component_id: string | null;
  supply_method: string | null;

  // Element 2 — why it is blocked (W2 maps to Hebrew via labelMaps.ts).
  category: BlockerCategory;
  blocker_label: BlockerLabelKey;

  // Element 3 — scale of risk (PBR-1 SUM across horizon)
  demand_qty: string | null;

  // Element 4 — urgency cue
  earliest_shortage_at: string | null;
  earliest_bucket_required_qty: string | null;
  affected_bucket_count: number | null;

  // Element 5 — severity (raw DB value; W2 maps to tone)
  severity: BlockerSeverity;

  // Element 6 — source enum
  source: BlockerSource;

  // Element 7 — emitted_at timestamp
  emitted_at: string;

  // Element 8 — fix action label (stable English key, W2 maps to Hebrew CTA)
  fix_action_label: FixActionLabelKey;

  // Element 9 — fix navigation
  fix_route: string | null;
  fix_route_params: Record<string, string> | null;

  // Element 10 — opaque jsonb passthrough (PBR-3); shown only in debug accordion
  blocker_detail: Record<string, unknown>;
}

export interface BlockersRunMeta {
  run_id: string | null;
  run_executed_at: string | null;
  run_status: string | null;
  planning_horizon_start_at: string | null;
  planning_horizon_weeks: number | null;
}

export interface BlockersResponse {
  run: BlockersRunMeta;
  page: number;
  page_size: number;
  total_blocker_count: number;
  rows: BlockerRow[];
}

// 422 / 404 reason codes the endpoint can return.
export type BlockersConflictReason = "RUN_NOT_FOUND" | "RUN_NOT_COMPLETED";
