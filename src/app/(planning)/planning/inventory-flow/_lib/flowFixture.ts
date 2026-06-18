import type { FlowItem } from "./types";

/** Test-support: a fully-populated single-day/single-week FlowItem. */
export function makeFlowItem(over: Partial<FlowItem> = {}): FlowItem {
  return {
    item_id: "a",
    item_name: "Babka Red",
    family: "BAKERY",
    sku_kind: "ITEM",
    supply_method: "MANUFACTURED",
    risk_tier: "healthy",
    days_of_cover: 30,
    effective_lead_time_days: 3,
    current_on_hand: 100,
    earliest_stockout_date: null,
    stockout_at_day_with_production: null,
    days_cover_with_production: 56,
    days: [
      {
        day: "2026-06-18",
        is_working_day: true,
        holiday_name_he: null,
        demand_lionwheel: 0,
        demand_forecast: 0,
        incoming_supply: 0,
        projected_on_hand_eod: 100,
        inflow_from_production: 0,
        incoming_supply_combined: 0,
        projected_on_hand_eod_with_production: 100,
        tier: "healthy",
        cell_tier_with_production: "healthy",
        shortfall_qty: 0,
        shortfall_qty_with_production: 0,
      },
    ],
    weeks: [
      {
        week_start: "2026-06-21",
        min_on_hand: 100,
        stockout_day: null,
        tier: "healthy",
        min_on_hand_with_production: 100,
        stockout_day_with_production: null,
        cell_tier_with_production: "healthy",
        max_shortfall_qty: 0,
      },
    ],
    ...over,
  };
}
