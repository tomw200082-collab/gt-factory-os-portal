import { proxyRequest } from "@/lib/api-proxy";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const qs = url.search;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/me/activity${qs}`,
    errorLabel: "my activity",
  });
}
