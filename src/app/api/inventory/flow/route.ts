import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/flow — Inventory Flow daily control tower data.
//
// Proxies to upstream Fastify API:
//   GET /api/v1/queries/inventory/flow
//
// Query params (forwarded verbatim):
//   start            — ISO date (YYYY-MM-DD) — start of the 14-day daily window
//   horizon_weeks    — 1..12 (default 8)
//   family           — optional family filter
//   supply_method    — optional MANUFACTURED|BOUGHT_FINISHED|REPACK
//   at_risk_only     — boolean (default false)
//
// Returns FlowResponseSchema per inventory_flow_contract.md §6.2.
// Operator + Planner + Admin may read.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/flow",
    forwardQuery: true,
    errorLabel: "inventory flow",
  });
}
