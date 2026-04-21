import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/components — proxy to Fastify API GET /api/v1/queries/components
//
// Feeds operator + admin dropdowns with live components master (158 rows).
// Forwards the Supabase Bearer JWT via proxyRequest; auth enforced upstream.
// Query forwarding default (?status=active / ?component_class= / ?limit=).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/components",
    errorLabel: "components list",
  });
}
