import { proxyRequest } from "@/lib/api-proxy";

// GET /api/portal/customer-search → GET /api/v1/queries/portal/customer-search

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/customer-search",
    errorLabel: "portal customer search",
  });
}
