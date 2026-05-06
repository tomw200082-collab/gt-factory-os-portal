import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/supply-flow — Supply-side daily projection (RM + PKG
// components and BOUGHT_FINISHED items). Sister surface to /api/inventory/flow.
//
// Proxies to upstream Fastify API:
//   GET /api/v1/queries/inventory/supply-flow
//
// Query params are forwarded verbatim (start, horizon_weeks, family,
// at_risk_only — note: the supply variant has no supply_method filter).
//
// Returns FlowResponseSchema per the supply-flow contract.
// Same SWR cache headers as /api/inventory/flow:
//   private, max-age=30, stale-while-revalidate=60.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const res = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/supply-flow",
    forwardQuery: true,
    errorLabel: "supply flow",
  });
  if (res.ok) {
    res.headers.set(
      "Cache-Control",
      "private, max-age=30, stale-while-revalidate=60",
    );
  }
  return res;
}
