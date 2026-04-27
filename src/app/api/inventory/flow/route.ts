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
  const res = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/flow",
    forwardQuery: true,
    errorLabel: "inventory flow",
  });
  // Add browser-side caching for repeat loads. Upstream DB query is ~22s
  // and the data changes slowly (planning runs once a day, ledger events
  // are minute-scale). 30s fresh + 60s stale-while-revalidate gives the
  // user near-instant repeat navigation while keeping data within the
  // same staleness window the TanStack hook already enforces (staleTime
  // 30s + refetchInterval 60s in useInventoryFlow.ts).
  // private = per-user only; do not cache at any shared CDN layer.
  if (res.ok) {
    res.headers.set(
      "Cache-Control",
      "private, max-age=30, stale-while-revalidate=60",
    );
  }
  return res;
}
