import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/portal/customer-search — Shopify customer lookup for approving a
// customer-portal registration (Tranche 179).
//
// GET → Fastify GET /api/v1/queries/portal/customer-search
//       The querystring is forwarded (`?q=<text>&registration_id=<uuid>`).
// 200: { rows: [{ id: "gid://shopify/Customer/N", name, city, orders_count,
//                 phone_matches }] }
//      phone_matches: the registration's phone is on that customer's record.
// 401: no session · 403: not admin
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/customer-search",
    errorLabel: "portal customer search",
  });
}
