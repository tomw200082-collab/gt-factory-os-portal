import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/purchase-orders — proxy to Fastify API
//   GET /api/v1/queries/purchase-orders
//
// Read-only PO list for planner screens. Any authenticated role may read.
// forwardQuery=true (default for GET) so ?status=OPEN|PARTIAL|RECEIVED|
// CANCELLED / ?supplier_id=... / ?limit=... pass through.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/purchase-orders",
    errorLabel: "purchase-orders list",
  });
}
