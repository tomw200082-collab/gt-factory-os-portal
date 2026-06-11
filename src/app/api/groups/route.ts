import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/groups — read proxy (Tranche 044, Groups v1).
//
// GET → Fastify GET /api/v1/queries/groups
//       Returns { product_groups: [...], material_groups: [...] }. Optional
//       ?active_only=true forwarded verbatim as a query param.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/groups",
    errorLabel: "groups list",
  });
}
