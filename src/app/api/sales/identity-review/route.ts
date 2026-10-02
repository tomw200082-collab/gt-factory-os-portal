import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/identity-review → GET /api/v1/queries/sales/identity-review (managers only)

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/identity-review",
    forwardQuery: false,
    errorLabel: "sales identity review",
  });
}
