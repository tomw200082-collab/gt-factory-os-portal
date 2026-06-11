// Purchase Session — portal DTO types. Mirror of the API response shapes
// from gt-factory-os/api/src/purchase-session/schemas.ts.

export type SessionType = "weekly" | "off_cycle";
export type SessionStatus = "open" | "completed" | "superseded";
export type PoTier = "must" | "recommended" | "urgent";
export type PoStatus = "proposed" | "approved" | "placed" | "skipped";

export interface PurchaseSessionLine {
  session_po_line_id: string;
  component_id: string | null;
  item_id: string | null;
  line_label: string;
  recommended_qty: number;
  final_qty: number;
  uom: string;
  unit_cost: number;
  line_cost: number;
  earliest_need_date: string | null;
  coverage_trace: unknown;
  is_user_added: boolean;
  is_dropped: boolean;
}

export interface PurchaseSessionPo {
  session_po_id: string;
  supplier_id: string;
  supplier_snapshot: string;
  tier: PoTier;
  status: PoStatus;
  order_by_date: string;
  earliest_need_date: string | null;
  covered_through_date: string | null;
  currency: string;
  total_cost: number;
  order_document_text: string | null;
  po_id: string | null;
  blocking_issues: unknown[];
  lines: PurchaseSessionLine[];
}

export interface PurchaseSessionTotals {
  po_count: number;
  line_count: number;
  total_cost: number;
  by_tier: { urgent: number; must: number; recommended: number };
  by_status: { proposed: number; approved: number; placed: number; skipped: number };
}

export interface PurchaseSessionWarning {
  code: string;
  detail: string;
  [k: string]: unknown;
}

export interface PurchaseSession {
  session_id: string;
  session_type: SessionType;
  session_date: string;
  status: SessionStatus;
  horizon_days: number;
  consolidation_window_days: number;
  rebuild_verifier_drift: number | null;
  warnings: PurchaseSessionWarning[];
  release_fence: string | null;
  created_at: string;
  completed_at: string | null;
  totals: PurchaseSessionTotals;
  pos: PurchaseSessionPo[];
}

export interface CurrentSessionResponse {
  session: PurchaseSession | null;
}
export interface SessionEnvelope {
  session: PurchaseSession;
}
export interface PoEnvelope {
  po: PurchaseSessionPo;
}

// Price Truth (Tranche 043) — one optional caller-entered price for a session
// line, forwarded verbatim by the place action. unit_price_net is per ORDER
// UOM. Mirror of PlacePoLinePriceSchema in
// gt-factory-os/api/src/purchase-session/schemas.ts.
export interface PlaceLinePrice {
  session_po_line_id: string;
  unit_price_net: number;
  supplier_item_id?: string;
}

// One PATCH/POST line edit.
export interface LineEdit {
  session_po_line_id: string;
  final_qty?: number;
  is_dropped?: boolean;
}
export interface LineAdd {
  component_id?: string;
  item_id?: string;
  final_qty: number;
}
