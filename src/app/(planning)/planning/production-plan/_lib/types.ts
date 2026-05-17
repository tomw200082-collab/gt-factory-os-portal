// Production Plan portal types — mirror of api/src/production-plan/schemas.ts.
// The portal does not import from the backend tree; drift is a bug.

export type RenderedState = "planned" | "done" | "cancelled";

export interface ProductionPlanRow {
  plan_id: string;
  plan_type: "production" | "note";
  plan_date: string;
  item_id: string | null;
  item_name: string | null;
  item_supply_method: string | null;
  planned_qty: string | null;
  uom: string | null;
  status: "planned" | "cancelled";
  rendered_state: RenderedState;

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
  | { action: "cancel"; cancel_reason: string }
  | {
      action?: undefined;
      plan_date?: string;
      planned_qty?: number;
      uom?: string;
      notes?: string;
      bom_version_id_pinned?: string;
    };

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

