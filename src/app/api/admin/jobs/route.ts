import { proxyRequest } from "@/lib/api-proxy";

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/admin/jobs",
    errorLabel: "admin jobs",
  });
}
