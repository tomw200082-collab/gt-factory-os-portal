// Production Plan portal types — mirror of api/src/production-plan/schemas.ts.
// The portal does not import from the backend tree; drift is a bug.

export type RenderedState = "planned" | "done" | "cancelled";

// One entry of a base-batch's pack_manifest, resolved to a display name.
export interface PackManifestLine {
  item_id: string;
  item_name: string | null;
  qty: string;
  // Liters of base per unit (items.base_fill_qty_per_unit), serialized as
  // text. Optional: older API deploys may omit it; the tune dialog's liters
  // meter degrades to unit totals when absent.
  fill_l_per_unit?: string | null;
  uom: string | null;
}

// B4 (Phase-6 production reporting): the REAL DB status, passed through
// additively by the API so the portal can distinguish draft and
// in-production rows. rendered_state remains the derived compat field.
export type ProductionPlanStatus =
  | "draft"
  | "planned"
  | "in_production"
  | "completed"
  | "cancelled";

export interface ProductionPlanRow {
  plan_id: string;
  plan_type: "production" | "note";
  plan_date: string;
  item_id: string | null;
  item_name: string | null;
  item_supply_method: string | null;
  planned_qty: string | null;
  uom: string | null;
  status: ProductionPlanStatus; // raw DB status (B4 passthrough)
  rendered_state: RenderedState;

  // B4 (Phase-6): base-batch display hints. A base-batch row plans a BASE
  // liquid batch (base_bom_head_id set, item_id null, pack_manifest > 0)
  // rather than a single FG item.
  base_bom_head_id: string | null;
  is_base_batch: boolean;
  pack_manifest_count: number; // jsonb_array_length(pack_manifest)
  // Per-SKU breakdown of a base-batch row (item name + qty). Empty array
  // for non-base-batch rows. Optional because older API deploys may not
  // send it yet — the card falls back to the "N SKUs" summary.
  pack_manifest?: PackManifestLine[];

  // DR-018 INTER-002 (Tranche 123). Backend companion:
  // gt-factory-os PR (production-plan is_user_modified reads). Optional
  // because the badge that reads it must degrade gracefully if this portal
  // deploys before that backend PR does.
  is_user_modified?: boolean;

  source_recommendation_id: string | null;
  source_run_id: string | null;
  source_run_status: string | null;
  source_recommendation_qty: string | null;

  bom_version_id_pinned: string | null;
  bom_version_label: string | null;

  notes: string | null;

  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
  updated_by_snapshot: string | null;

  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;

  completed_submission_id: string | null;
  completed_actual: {
    submission_id: string;
    event_at: string;
    output_qty: string;
    scrap_qty: string;
    output_uom: string;
    variance_qty: string;
    variance_pct: string | null;
  } | null;
}

export interface ListProductionPlanResponse {
  rows: ProductionPlanRow[];
  count: number;
  as_of: string;
}

export interface CreateProductionPlanRequest {
  plan_type: "production";
  idempotency_key?: string;
  plan_date: string;
  item_id: string;
  planned_qty: number;
  uom: string;
  source_recommendation_id?: string;
  bom_version_id_pinned?: string;
  notes?: string;
}

export interface CreateNoteRequest {
  plan_type: "note";
  idempotency_key?: string;
  plan_date: string;
  notes: string;
}

export type CreatePlanOrNoteRequest = CreateProductionPlanRequest | CreateNoteRequest;

export interface CreateProductionPlanResponse {
  plan_id: string;
  rendered_state: RenderedState;
  echo: ProductionPlanRow;
  idempotent_replay: boolean;
}

export type PatchProductionPlanRequest =
  // cancel_reason is OPTIONAL since 2026-06-15 (Tom-directed): a blank cancel
  // sends null and the backend stores null.
  | { action: "cancel"; cancel_reason?: string | null }
  | {
      action?: undefined;
      plan_date?: string;
      planned_qty?: number;
      uom?: string;
      notes?: string;
      bom_version_id_pinned?: string;
      // Base-batch pack-split tuning (meeting cockpit): the COMPLETE intended
      // split — the backend replaces the row's manifest wholesale and
      // recomputes fg_share. Base-batch rows only; cannot be combined with
      // planned_qty/uom (batch stays = batch_size_l).
      pack_manifest?: Array<{ item_id: string; qty: number }>;
    };

// DELETE /api/v1/mutations/production-plan/:id — hard-delete response.
// Mirror of api/src/production-plan/schemas.ts DeleteProductionPlanResponse.
export interface DeleteProductionPlanResponse {
  deleted: true;
  plan_id: string;
}

// GET /api/v1/queries/production-plan/recommendation-candidates
// W1 contract: docs/recommendation_candidates_endpoint_checkpoint.md §6.2.
// Mirrors api/src/production-plan/schemas.ts.
export interface RecommendationCandidate {
  recommendation_id: string;
  run_id: string;
  run_executed_at: string;       // ISO 8601 — planning_runs.executed_at
  run_status: string;            // typically 'completed'
  item_id: string;
  item_display_name: string | null;
  item_supply_method: string | null;  // MANUFACTURED | REPACK
  suggested_qty: string;         // qty_8dp serialized as text
  uom: string | null;            // items.sales_uom
  suggested_for_date: string;    // YYYY-MM-DD (target_period_bucket_key)
  due_date: string | null;
  order_by_date: string | null;
  shortage_date: string | null;
  feasibility_status: string;    // ready_now | blocked_*
  recommendation_status: string; // 'approved'
  approved_at: string | null;
}

export interface RecommendationCandidatesResponse {
  rows: RecommendationCandidate[];
  page: number;
  page_size: number;
  total: number;
  as_of: string;
}

