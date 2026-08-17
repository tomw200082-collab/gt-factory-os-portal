import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/leads → GET /api/v1/queries/sales/leads
// Source: api_read.v_leads (db/migrations/0323).
// Admin-only upstream; lead rows are PII and never reach the browser
// except through this proxy.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/leads",
    forwardQuery: false,
    errorLabel: "sales leads",
  });
}
