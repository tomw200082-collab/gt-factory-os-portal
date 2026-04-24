import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/purchase-orders/parity-check
//   → GET /api/v1/queries/purchase-orders/parity-check
//   Admin only — checks for header vs. line status drift.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/purchase-orders/parity-check",
    errorLabel: "purchase-order parity-check",
  });
}
