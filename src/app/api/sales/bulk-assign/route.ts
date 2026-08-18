import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/bulk-assign → POST /api/v1/mutations/sales/leads/bulk-assign
// Writes through sales_core.bulk_assign (db/migrations/0325): one transaction,
// the roster checked once before any lock, at most 200 leads per call.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/sales/leads/bulk-assign",
    forwardQuery: false,
    errorLabel: "sales bulk assign",
  });
}
