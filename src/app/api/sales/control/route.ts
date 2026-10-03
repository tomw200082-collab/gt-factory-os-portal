import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/control → GET /api/v1/queries/sales/control
// The control room (D-045). The server allows only the session email tom@gteveryday.com and
// answers 404 to everyone else; that answer is passed through unchanged.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/control",
    forwardQuery: false,
    errorLabel: "sales control",
  });
}
