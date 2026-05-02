import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/planned-inflow — Planned-inflow overlay data.
//
// Proxies to upstream Fastify API:
//   GET /api/v1/queries/inventory/planned-inflow
//
// Query params (forwarded verbatim):
//   from     — required ISO date (YYYY-MM-DD), validated upstream
//   to       — required ISO date (YYYY-MM-DD), validated upstream
//   item_id  — optional, narrows to one item
//
// Returns the upstream payload shape verbatim (per signal #32 scope_summary):
//   { rows: [{ plan_date, item_id, item_display_name, sales_uom, supply_method,
//     planned_qty_total, completed_qty_total, planned_remaining_qty,
//     cancelled_qty_total, plan_count, plan_count_completed,
//     plan_count_cancelled, plan_count_remaining, latest_created_at }],
//     as_of, horizon_days, source_view }
//
// Auth: operator + planner + admin (viewer 403 upstream).
// Live-state surface — Cache-Control no-store; client refetches at ~60s
// per planned_inflow_overlay_contract §4.8.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const res = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/planned-inflow",
    forwardQuery: true,
    errorLabel: "inventory planned-inflow",
  });
  if (res.ok) {
    res.headers.set("Cache-Control", "private, no-store");
  }
  return res;
}
