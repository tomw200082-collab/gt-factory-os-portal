import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/approved — customers approved for the ordering portal: the
// customer_portal.access rows that are not revoked (Tranche 179).
//
// GET → Fastify GET /api/v1/queries/portal/approved
//       The querystring is forwarded (`?q=<text>`).
// 200: { rows: [{ access_id, wa_phone, display_name, branch,
//                 shopify_customer_id, approved_at, source }] }
// 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/approved",
    errorLabel: "portal approved customers",
  });
}
