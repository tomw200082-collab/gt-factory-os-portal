import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/suppliers — proxy to Fastify API GET /api/v1/queries/suppliers
//
// Feeds Goods Receipt supplier dropdown + admin suppliers page with live
// suppliers master (56 rows). Forwards the Supabase Bearer JWT; auth upstream.
// Query forwarding default (?status=ACTIVE / ?supplier_type= / ?limit=).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/suppliers",
    errorLabel: "suppliers list",
  });
}
