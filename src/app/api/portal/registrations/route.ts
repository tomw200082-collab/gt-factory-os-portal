import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/registrations — customer-portal access requests (Tranche 179).
//
// GET → Fastify GET /api/v1/queries/portal/registrations
//       The querystring is forwarded (`?status=pending`).
// 200: { rows: [{ id, wa_phone, business_name, branch_city, contact_name,
//                 suggested_customer_id, status, created_at }] }
// 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/registrations",
    errorLabel: "portal registrations",
  });
}
