import { proxyRequest } from "@/lib/api-proxy";

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/forecasts/publish",
    errorLabel: "forecasts publish",
  });
}
