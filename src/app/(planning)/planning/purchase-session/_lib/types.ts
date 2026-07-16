// Purchase Session — portal DTO types. Mirror of the API response shapes
// from gt-factory-os/api/src/purchase-session/schemas.ts.

export type SessionType = "weekly" | "off_cycle";
export type SessionStatus = "open" | "completed" | "superseded";
export type PoTier = "must" | "recommended" | "urgent";
export type PoStatus = "proposed" | "approved" | "placed" | "skipped";

// 0250: physical label size carried on a label line (priced by size).
export interface LineLabelSize {
  size_id: string;
  width_mm: number;
  height_mm: number;
  label: string;
}

// 0250: procurement spec resolved per (component, supplier).
export interface LineProcurementSpec {
  supplier_catalog_wording: string | null;
  material: string | null;
  finish: string | null;
  print: string | null;
  design: string | null;
  dimensions_mm: string | null;
  ordering_notes: string | null;
}

// 0251: a current file attached to the line's component.
export interface LineAsset {
  asset_type: "PHOTO" | "PRINT_FILE" | "SPEC_SHEET";
  file_name: string;
  dpi: number | null;
}

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
  // 0250 / 0251 order-sheet enrichment. Optional — older API responses omit
  // them; treated as false / null / [] at the read boundary.
  is_label?: boolean;
  label_size?: LineLabelSize | null;
  procurement_spec?: LineProcurementSpec | null;
  assets?: LineAsset[];
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
  // Engine provenance the API has returned since 0235 but the portal type
  // dropped until tranche 132: which demand model ran, and the firmed-plan
  // window snapshot (firmed weeks, drafts excluded). Optional — older
  // sessions carry null.
  demand_model_version?: string | null;
  firmed_window?: unknown | null;
  // 0284: input-trustworthiness snapshot (forecast age + coverage gap,
  // physical-count staleness over the buy-list targets, verifier drift).
  // null on sessions generated before the migration.
  input_integrity?: unknown | null;
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
