// ---------------------------------------------------------------------------
// Recommendation Drill-Down — TypeScript types
//
// Mirrors the W1 DTO contract for GET /api/v1/queries/planning/recommendations/:rec_id/detail
// exactly. No fields invented beyond the contract shape.
//
// DTO version: 1.1. Sourced from api/src/planning/schemas.ts §688-746
// (RecommendationDetailResponse + LeadTimeSource). Signal #21 emitted
// 2026-05-01T22:00:00Z (RUNTIME_READY(Planning-Tranche2-RecommendationDetail-v1.1),
// evidence Projects/gt-factory-os/docs/recommendation_detail_dto_extension_checkpoint.md).
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

  components: RecDetailComponent[];

  open_pos: RecDetailOpenPO[];

  scoped_exceptions: RecDetailException[];

  planning_run_site_id: string;
  planning_run_status: string;
}
