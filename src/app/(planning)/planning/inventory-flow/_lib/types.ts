// ---------------------------------------------------------------------------
// Inventory Flow types — TypeScript mirrors of backend FlowResponseSchema
// from inventory_flow_contract.md §6.2 (W4-authored, cycle 2).
//
// Types are kept verbatim shape. Numeric fields (qty / on-hand) are typed
// `number` here because the upstream JSON serializes plain numbers; the API
// contract pack §6.3 specifies "JSON serialization is plain-number — clients
// render at 0–2 decimal places per format.ts rules".
//
// Mode B-InventoryFlow forbids inventing backend contract values. If a
// portal hook needs a field not on this type, emit assumption_failure.
// ---------------------------------------------------------------------------

export type RiskTier = "healthy" | "watch" | "critical" | "stockout";
export type DayCellTier = RiskTier | "non_working";
export type SupplyMethod = "MANUFACTURED" | "BOUGHT_FINISHED" | "REPACK";

// Polish A v3 review (2026-05-04) — Tom-locked 5-level production-aware
// cell tier (red → orange → yellow → yellow-green → green) keyed on
// days-to-next-stockout under the production-aware projection. `non_working`
// always overrides (Friday/Saturday/holiday).
export type CellTierWithProduction =
  | "critical_stockout"
  | "at_risk"
  | "low"
  | "medium"
  | "healthy"
  | "non_working";

export interface FlowDay {
  day: string; // YYYY-MM-DD
  is_working_day: boolean;
  holiday_name_he: string | null;
  demand_lionwheel: number;
  demand_forecast: number;
  incoming_supply: number;
  projected_on_hand_eod: number;
  // Migration 0144 (Polish A v3, 2026-05-04) — planned-production aware
  // fields. `inflow_from_production` is per-day FG units arriving from
  // planned production at +1 day lag. `incoming_supply_combined` =
  // incoming_supply + inflow_from_production. `projected_on_hand_eod_with_production`
  // is the production-aware counterpart of `projected_on_hand_eod` and is
  // what the day cell tier (STOCKOUT) is computed against server-side.
  inflow_from_production: number;
  incoming_supply_combined: number;
  projected_on_hand_eod_with_production: number;
  tier: DayCellTier;
  // Polish A v3 review (2026-05-04) — server-computed 5-tier classifier.
  // Optional/nullable so the portal can defensively fall back to `tier`
  // during deployment ordering (API rollout before portal, or vice-versa).
  cell_tier_with_production?: CellTierWithProduction | null;
}

export interface FlowWeek {
  week_start: string; // YYYY-MM-DD
  min_on_hand: number;
  stockout_day: string | null;
  tier: RiskTier;
  // Polish A v3 review (2026-05-04) — production-aware counterparts
  // (computed server-side by joining production_plan at +1 day lag for
  // weeks 3..8). Optional so the portal degrades gracefully if the API
  // hasn't shipped yet.
  min_on_hand_with_production?: number | null;
  stockout_day_with_production?: string | null;
  // 2026-05-04 fix: server-computed 5-tier classifier for the week cell,
  // keyed on days-from-week_start to next stockout (same Tom-locked
  // thresholds as the per-day classifier). Replaces the front-end's
  // coarse 4→5 mapping. Optional so the portal degrades gracefully if
  // the API hasn't rolled forward yet.
  cell_tier_with_production?: CellTierWithProduction | null;
}

export interface FlowItem {
  item_id: string;
  item_name: string;
  family: string | null;
  supply_method: string;
  risk_tier: RiskTier;
  days_of_cover: number;
  effective_lead_time_days: number;
  current_on_hand: number;
  earliest_stockout_date: string | null;
  // Polish A v3 review (2026-05-04) — production-aware counterparts.
  //   stockout_at_day_with_production : first horizon day where the
  //     production-aware EOD goes negative (NULL = no stockout in horizon).
  //   days_cover_with_production      : days from today to that stockout.
  //     When no stockout in horizon, server returns the horizon length
  //     (56 days = 8 weeks) as a "covered for the full window" sentinel.
  // Both optional so the portal degrades gracefully if the API hasn't
  // rolled forward yet.
  stockout_at_day_with_production?: string | null;
  days_cover_with_production?: number | null;
  days: FlowDay[];
  weeks: FlowWeek[];
}

export interface FlowSummary {
  at_risk_count: number;
  earliest_stockout: {
    date: string;
    item_id: string;
    item_name: string;
  } | null;
  open_orders_count: number;
  exceptions_count: number;
  unknown_sku_pct_of_demand: number; // fraction in [0,1]
}

export interface FlowResponse {
  as_of: string; // ISO8601 datetime
  summary: FlowSummary;
  items: FlowItem[];
}

// ---------------------------------------------------------------------------
// Item-detail types (§6.1 row 2 — drill-down)
// ---------------------------------------------------------------------------

export interface FlowItemDetailOrder {
  lw_task_id: string;
  wp_order_id: string | null;
  legacy_sku: string | null;
  pickup_at: string | null;
  qty: number;
  status: string;
  customer_name: string | null;
}

export interface FlowItemDetailPo {
  po_id: string;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  expected_delivery_date: string | null;
  status: string;
  qty_open: number;
}

export interface FlowItemDetail {
  item_id: string;
  item_name: string;
  family: string | null;
  supply_method: string;
  risk_tier: RiskTier;
  days_of_cover: number;
  effective_lead_time_days: number;
  current_on_hand: number;
  earliest_stockout_date: string | null;
  orders: FlowItemDetailOrder[];
  pos: FlowItemDetailPo[];
}

// ---------------------------------------------------------------------------
// Query / filter shape (matches FlowQuerySchema §6.2)
// ---------------------------------------------------------------------------

export interface FlowQueryParams {
  start?: string;
  horizon_weeks?: number;
  family?: string;
  supply_method?: SupplyMethod;
  at_risk_only?: boolean;
}
