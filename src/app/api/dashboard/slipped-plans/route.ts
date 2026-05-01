import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/dashboard/slipped-plans
//
// Mirror-only proxy to upstream Fastify API:
//   GET /api/v1/queries/dashboard/slipped-plans
//
// Backed by signal #24 RUNTIME_READY(DashboardSlippedPlans) (2026-05-02).
// Source view: api_read.v_production_plan_slippage (db/migrations/0118).
//
// Response shape (per api/src/dashboard/schemas.ts SlippedPlansResponse):
//   { rows: SlippedPlanRow[], as_of: string, window_days: 7 }
// where each row has 10 verbatim view columns:
//   plan_id, plan_date (YYYY-MM-DD), item_id, item_name (nullable),
//   planned_qty (string for qty_8dp precision), uom,
//   source_recommendation_id (nullable for manual plans), slipped_at,
//   updated_at, days_overdue (1..7 by view construction).
//
// window_days = 7 is locked at the view layer (DCT2-3 default).
//
// No query parameters. Role gate enforced upstream:
//   missing auth = 401, viewer = 403, operator/planner/admin = 200.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/dashboard/slipped-plans",
    forwardQuery: false,
    errorLabel: "dashboard slipped-plans",
  });
}
