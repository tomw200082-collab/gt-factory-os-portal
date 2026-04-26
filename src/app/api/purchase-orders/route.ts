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

// ---------------------------------------------------------------------------
// POST /api/purchase-orders — proxy to Fastify API
//   POST /api/v1/mutations/purchase-orders
//
// Manual PO creation. Gated to planner/admin at the upstream handler.
// Body is forwarded as-is; proxyRequest handles session + Bearer JWT.
// Mirror of api/src/planning/route.ts POST /mutations/purchase-orders.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/purchase-orders",
    errorLabel: "purchase-orders create",
  });
}
