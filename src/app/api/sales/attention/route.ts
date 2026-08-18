import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/attention → GET /api/v1/queries/sales/attention
// Source: api_read.v_sales_attention (db/migrations/0326) — overdue, unowned
// and stalled leads in one read. Admin-only upstream; lead rows are PII and
// never reach the browser except through this proxy.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/attention",
    forwardQuery: true,
    errorLabel: "sales attention",
  });
}
