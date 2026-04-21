import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/items — proxy to Fastify API GET /api/v1/queries/items
//
// Feeds operator + admin dropdowns with live items master (72 rows). Forwards
// the Supabase Bearer JWT via proxyRequest; auth enforced upstream.
// Query forwarding is default (forwardQuery=true for GET), so ?status=active
// / ?supply_method=MANUFACTURED / ?limit= pass through.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/items",
    errorLabel: "items list",
  });
}
