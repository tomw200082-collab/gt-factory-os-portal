import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/integration-sku-map — proxy to Fastify API
//   GET /api/v1/queries/integration-sku-map
//
// Endgame Phase E1-UI (crystalline-drifting-dusk §B.E1): feeds the admin
// /admin/sku-aliases review surface with live integration_sku_map rows
// (source_channel filter + approval_status filter forwarded via querystring).
// Forwards the Supabase Bearer JWT via proxyRequest; auth + role-gate enforced
// upstream. Querystring passthrough is default for GET, so ?source_channel=
// and ?approval_status= carry through unchanged.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/integration-sku-map",
    errorLabel: "sku alias list",
  });
}
