import { proxyRequest } from "@/lib/api-proxy";

// POST /api/portal/login-link → POST /api/v1/mutations/portal/login-link

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/portal/login-link",
    errorLabel: "portal login link",
  });
}
