// Shared types for the "Date range plan" mode of /planning/production-simulation.
//
// These mirror the response of GET /api/production-plan/material-requirements
// → backend api/src/production-plan/material_requirements.ts. The portal does
// not import from the backend tree; drift between the two is a bug.

export type CoverageStatus =
  | "covered"
  | "partial"
  | "not_covered"
  | "no_stock_data";

export type MaterialGroup = "ingredient" | "packaging" | "other";

/** One product's contribution to a single component's demand. */
export interface MaterialDemandSource {
  plan_id: string;
  item_id: string | null;
  item_name: string | null;
  plan_date: string; // YYYY-MM-DD
  qty: string;
}

/** Demand for a component bucketed on a single plan date. */
export interface MaterialDemandBucket {
  date: string; // YYYY-MM-DD
  qty: string;
}

export interface MaterialComponentLine {
  component_id: string;
  component_name: string;
  component_uom: string | null;
  component_class: string | null;
  group: MaterialGroup;
  total_required_qty: string;
  on_hand_qty: string;
  net_shortage_qty: string;
  coverage_status: CoverageStatus;
  coverage_pct: string;
  first_needed_date: string; // YYYY-MM-DD
  shortage_date: string | null; // YYYY-MM-DD
  supplier_id: string | null;
  supplier_short: string | null;
  supplier_phone: string | null;
  lead_time_days: number | null;
  demand_by_date: MaterialDemandBucket[];
  sources: MaterialDemandSource[];
}

export interface SkippedPlan {
  plan_id: string;
  item_id: string | null;
  item_name: string | null;
  plan_date: string;
  planned_qty: string | null;
  reason: string;
}

export interface MaterialRequirementsResponse {
  from: string;
  to: string;
  plans_total: number;
  plans_simulated: number;
  plans_skipped: SkippedPlan[];
  balances_as_of: string | null;
  total_components: number;
  components_covered: number;
  components_partial: number;
  components_short: number;
  components_no_stock_data: number;
  availability_note: string;
  open_po_qty_note: string;
  components: MaterialComponentLine[];
  warnings: string[];
}
