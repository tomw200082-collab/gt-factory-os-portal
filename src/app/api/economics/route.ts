import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/economics — proxy to Fastify
//   GET /api/v1/queries/economics
//
// Phase 10A: returns COGS-per-unit + inventory-at-cost rows for every item.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/economics",
    errorLabel: "economics list",
  });
}
