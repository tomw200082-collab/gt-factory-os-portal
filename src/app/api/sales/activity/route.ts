import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/activity → GET /api/v1/queries/sales/activity
// Source: api_read.v_sales_activity (db/migrations/0327) — the cross-lead
// audit trail. Admin-only upstream; the ?limit= travels with the request.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/activity",
    forwardQuery: true,
    errorLabel: "sales activity",
  });
}
