import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-actuals/history — proxy to Fastify API
//   GET /api/v1/queries/production-actuals
//
// Returns a paginated list of production actual submissions for the
// "Recent production runs" section on the Production Actual form page.
// Accepts ?limit=N passthrough via forwardQuery (default true for GET).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-actuals",
    errorLabel: "production actual history",
  });
}
