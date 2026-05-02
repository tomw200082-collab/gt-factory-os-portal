import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/planned-inflow — Planned-inflow overlay data.
//
// Proxies to upstream Fastify API:
//   GET /api/v1/queries/inventory/planned-inflow
//
// Query params (forwarded verbatim):
//   from     — required, ISO date YYYY-MM-DD
//   to       — required, ISO date YYYY-MM-DD
//   item_id  — optional, narrows to a single FG item
//
// Returns the row shape documented in
//   docs/cycle20_w1_planned_inflow_endpoint_checkpoint.md §1.3
// and aggregated from
//   api_read.v_planned_inflow_by_day (migration 0125; signal #29).
//
// Auth: operator + planner + admin (viewer 403). Mirrored upstream.
// Read-only. No mutation path. No write to stock_ledger / current_balances /
// balance_anchors_current — the overlay never moves stock (contract §2 B2).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const res = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/planned-inflow",
    forwardQuery: true,
    errorLabel: "planned inflow",
  });
  // Per upstream contract §4.8 Cache-Control: no-store (live-state surface).
  // Do not add browser caching beyond the per-user TanStack Query layer; the
  // overlay must reflect plan additions/cancellations at the next 60s tick.
  return res;
}
