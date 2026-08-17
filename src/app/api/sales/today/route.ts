import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/today → GET /api/v1/queries/sales/today
// Source: api_read.v_today (db/migrations/0323).
// Admin-only upstream; lead rows are PII and never reach the browser
// except through this proxy.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/today",
    forwardQuery: true,
    errorLabel: "sales today queue",
  });
}
