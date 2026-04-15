import type { DashboardTileDto } from "@/lib/contracts/dto";

export const SEED_DASHBOARD: DashboardTileDto = {
  stock_health: {
    total_items: 28,
    in_shortage: 3,
    in_overstock: 2,
    healthy: 23,
  },
  shortage_risk: [
    {
      item_id: "RAW-MINT-LEAVES",
      item_name: "Fresh mint leaves",
      days_to_stockout: 1,
      on_hand: 0.6,
      unit: "KG",
    },
    {
      item_id: "RAW-LIME-JUICE",
      item_name: "Fresh lime juice",
      days_to_stockout: 3,
      on_hand: 9.4,
      unit: "L",
    },
    {
      item_id: "PKG-LBL-MOJ",
      item_name: "Label — Mojito 450ml",
      days_to_stockout: 5,
      on_hand: 420,
      unit: "PCS",
    },
    {
      item_id: "FG-MOJ-450",
      item_name: "Mojito cocktail 450ml",
      days_to_stockout: 6,
      on_hand: 132,
      unit: "BOTTLE",
    },
  ],
  planning_run: {
    last_run_at: "2026-04-14T05:00:00Z",
    recommendation_count: 18,
    flagged_count: 4,
  },
  exceptions_summary: {
    info: 2,
    warning: 3,
    critical: 1,
  },
  freshness: {
    ledger_last_post_at: "2026-04-14T11:55:00Z",
    lionwheel_last_sync_at: "2026-04-14T09:48:00Z",
    shopify_last_sync_at: "2026-04-14T11:20:00Z",
    greeninvoice_last_pull_at: "2026-04-14T07:02:00Z",
  },
  readiness: {
    ledger_integrity: "warn",
    projection_lag_seconds: 12,
    jobs_health: "warn",
  },
};
