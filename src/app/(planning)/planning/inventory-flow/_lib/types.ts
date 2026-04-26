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

export interface FlowDay {
  day: string; // YYYY-MM-DD
  is_working_day: boolean;
  holiday_name_he: string | null;
  demand_lionwheel: number;
  demand_forecast: number;
  incoming_supply: number;
  projected_on_hand_eod: number;
  tier: DayCellTier;
}

export interface FlowWeek {
  week_start: string; // YYYY-MM-DD
  min_on_hand: number;
  stockout_day: string | null;
  tier: RiskTier;
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
