import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/economics/raw-materials — proxy to Fastify
//   GET /api/v1/queries/economics/raw-materials
//
// Returns raw-material / packaging inventory valuation: one row per RM/PKG
// component with on-hand stock, its effective unit cost and inventory value,
// plus a `totals` rollup. Backed by the v_rm_pkg_economics view (migration
// 0208).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/economics/raw-materials",
    errorLabel: "raw material economics list",
  });
}
