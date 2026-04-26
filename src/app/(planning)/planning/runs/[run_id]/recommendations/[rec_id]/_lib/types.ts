// ---------------------------------------------------------------------------
// Recommendation Drill-Down — TypeScript types
//
// Mirrors the W1 DTO contract for GET /api/v1/queries/planning/recommendations/:rec_id/detail
// exactly. No fields invented beyond the contract shape.
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

  components: RecDetailComponent[];

  open_pos: RecDetailOpenPO[];

  scoped_exceptions: RecDetailException[];

  planning_run_site_id: string;
  planning_run_status: string;
}
