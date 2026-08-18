import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/quick-add → POST /api/v1/mutations/sales/quick-add
// Writes through sales_core.ingest_lead, so a lead typed on a phone takes
// the same path as one arriving from Meta.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/sales/quick-add",
    forwardQuery: false,
    errorLabel: "sales quick-add",
  });
}
