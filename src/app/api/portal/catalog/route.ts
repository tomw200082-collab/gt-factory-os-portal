import { proxyRequest } from "@/lib/api-proxy";

// GET /api/portal/catalog → GET /api/v1/queries/portal/catalog

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/catalog",
    errorLabel: "portal catalogue",
  });
}
