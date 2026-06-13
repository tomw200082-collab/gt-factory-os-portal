import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/credit-tracking — proxy to Fastify
//   GET /api/v1/queries/credit-tracking?status=PENDING&limit=200&offset=0
//
// Bookkeeper credit-tracking page (Tom 2026-06-12): list of picking-shortage
// rows (credit_tasks) with customer, item, quantities, and the bookkeeper's
// resolution status. Read allowed for any authenticated role upstream.
// Backend: api/src/credit_tracking/route.ts (migration 0241).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/credit-tracking",
    forwardQuery: true,
    errorLabel: "credit tracking list",
  });
}
