import { proxyRequest } from "@/lib/api-proxy";

// GET /api/portal/approved → GET /api/v1/queries/portal/approved

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/approved",
    errorLabel: "portal approved customers",
  });
}
