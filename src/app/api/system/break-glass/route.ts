import { proxyRequest } from "@/lib/api-proxy";

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/system/break-glass",
    forwardQuery: false,
    errorLabel: "system break-glass",
  });
}
