// ---------------------------------------------------------------------------
// Recommendation Drill-Down — TypeScript types
//
// Mirrors the W1 DTO contract for GET /api/v1/queries/planning/recommendations/:rec_id/detail
// exactly. No fields invented beyond the contract shape.
//
// DTO version: 1.2. Sourced from api/src/planning/schemas.ts §688-746
// (RecommendationDetailResponse + LeadTimeSource). Signal #21 emitted
// 2026-05-01T22:00:00Z (RUNTIME_READY(Planning-Tranche2-RecommendationDetail-v1.1),
// evidence Projects/gt-factory-os/docs/recommendation_detail_dto_extension_checkpoint.md).
// Signal #35 emitted 2026-05-10T00:00:00Z (RUNTIME_READY(Planning-TrustMinimum-W1)).
// v1.2 additive: safety_stock_qty + safety_breach_date + stockout_date + available_date
// + planning_mode + demand_breakdown + coverage_curve.
// Original signal #16 (DTO v1.0) preserved verbatim — no rename, no removal,
// no type narrowing. v1.1 is additive: lead_time_source + forecast_version_id.
// ---------------------------------------------------------------------------

export interface RecDetailComponent {
  component_id: string;
  component_name: string;
  demand_qty: string;
  on_hand_qty: string;
  open_po_qty: string;
  net_purchase_qty: string;
  unit: string | null;
}

export interface RecDetailOpenPO {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  item_id: string | null;
  component_id: string | null;
  open_qty: string;
  expected_receive_date: string | null;
}

export interface RecDetailException {
  exception_id: string;
  category: string;
  severity: string;
  detail: string | null;
  emitted_at: string;
}

// DTO v1.1 additive — Lead-time provenance enum.
//
// Mirrored verbatim from api/src/planning/schemas.ts §688-694 LeadTimeSourceValues.
// Cascade derivation at SELECT time (handler.reads.ts §Step 5.5):
//   1. supplier_items.lead_time_days per (supplier_id, item_id|component_id)
//   2. suppliers.default_lead_time_days
//   3. logic_trace->>'lead_time_days' (Phase-1 BF generator pin)
//   4. 'unknown' fallback (NEVER null)
//
// W2 must render: source label chip + numeric lead_time_days when source !=
// 'unknown'; reduced "Source unknown" caveat ONLY when source = 'unknown'.
export const LeadTimeSourceValues = [
  "supplier_items",
  "supplier_default",
  "recommendation_snapshot",
  "unknown",
] as const;
export type LeadTimeSource = (typeof LeadTimeSourceValues)[number];

// DTO v1.2 additive — Per-item planning mode sourced from planning_item_config.
// Defaults to 'auto' when no config row exists. 'blocked' items never receive
// new recommendations; the field still appears on historical recs that were
// generated before the item was blocked.
export type PlanningMode = 'auto' | 'manual_review' | 'blocked';

// DTO v1.2 additive — Weekly coverage curve row.
// One row per period_bucket_key for this item+run.
export interface CoverageCurveRow {
  week: string;
  projected_on_hand: string;
  safety_stock_qty: string;
  shortage_flag: boolean;
}

// DTO v1.2 additive — Demand split by source (forecast vs confirmed orders).
// Quantities as numeric strings (8dp precision); both fields always present.
export interface DemandBreakdown {
  forecast_qty: string;
  confirmed_qty: string;
}

export interface RecommendationDetailResponse {
  rec_id: string;
  run_id: string;
  run_created_at: string;
  rec_type: "purchase" | "production";
  rec_status: string;
  converted_po_id: string | null;

  item_id: string;
  item_name: string;
  supply_method: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK";

  supplier_id: string | null;
  supplier_name: string | null;

  demand_qty: string;
  on_hand_qty: string;
  open_po_qty: string;
  net_shortage_qty: string;

  recommended_qty: string;
  moq: string | null;
  lead_time_days: number | null;
  suggested_order_date: string | null;

  // ---- DTO v1.1 additive fields (signal #21) ----

  // Lead-time provenance enum. NEVER null — when no source resolves the value
  // is 'unknown', not null. Closes W1-FOLLOWUP-REC-DETAIL-LEAD-TIME-SOURCE
  // (W2 cycle 3 marker dropped W2 cycle 4).
  lead_time_source: LeadTimeSource;

  // Source forecast version this run was executed against. NULL for runs
  // executed before the forecast-snapshot link landed (~39 of 98 live runs
  // 2026-05-01) or for runs not tied to a forecast (e.g., orders-only).
  // Reads planning_runs.demand_snapshot_forecast_version_id under the hood
  // (DTO exposes the canonical short name). Closes
  // W1-FOLLOWUP-REC-DETAIL-FORECAST-VERSION (W2 cycle 3 marker dropped W2
  // cycle 4).
  forecast_version_id: string | null;

  // ---- end DTO v1.1 additive fields ----

  // ---- DTO v1.2 additive fields (signal #35) ----

  // Safety stock quantity used by the planning engine for this item+run.
  // NULL for runs produced before migration 0176 (legacy) or items with no
  // safety stock configured.
  safety_stock_qty: string | null;

  // First period_bucket_key (YYYY-MM-DD) where ADJUSTED projected on-hand
  // (safety-stock-deducted) goes below 0 — the safety-breach date.
  // NULL = no safety breach within horizon.
  safety_breach_date: string | null;

  // First period_bucket_key where UNADJUSTED projected on-hand <= 0 —
  // the actual stockout date, distinct from safety_breach_date.
  // NULL = no stockout within horizon.
  stockout_date: string | null;

  // Earliest date the ordered quantity is projected to be available:
  //   purchase path → order_by_date + lead_time_days
  //   production path → shortage_date
  // NULL when lead_time_days is null (purchase) or shortage_date is null (production).
  available_date: string | null;

  // Per-item planning mode sourced from planning_item_config.
  // Defaults to 'auto' when no config row exists for this item+site.
  // 'blocked' items never receive recommendations; this field still appears
  // on historical recs that were generated before the item was blocked.
  planning_mode: PlanningMode;

  // Demand split by source for this item+run. Quantities as numeric strings
  // (8dp precision). Both fields are always present; may be "0.00000000".
  demand_breakdown: DemandBreakdown;

  // Weekly coverage curve for this item+run: one row per period_bucket_key.
  // Empty array when no coverage data exists (legacy runs or component-path recs).
  coverage_curve: CoverageCurveRow[];

  // ---- end DTO v1.2 additive fields ----

  components: RecDetailComponent[];

  open_pos: RecDetailOpenPO[];

  scoped_exceptions: RecDetailException[];

  planning_run_site_id: string;
  planning_run_status: string;
}
