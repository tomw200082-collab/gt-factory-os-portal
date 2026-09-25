import { proxyRequest } from "@/lib/api-proxy";

// GET /api/portal/registrations → GET /api/v1/queries/portal/registrations

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/portal/registrations",
    errorLabel: "portal registrations",
  });
}
