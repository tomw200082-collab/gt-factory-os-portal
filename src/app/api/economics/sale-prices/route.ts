import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/economics/sale-prices — proxy to Fastify
//   POST /api/v1/mutations/economics/sale-prices
//
// Admin-only. Appends a fg_sale_prices history row (the manually-entered
// average sale price for a finished good).
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/economics/sale-prices",
    errorLabel: "economics sale-price create",
  });
}
