import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/settings → GET /api/v1/queries/sales/settings
// PUT /api/sales/settings → PUT /api/v1/mutations/sales/settings
// The two settings the workspace has: SLA hours and the WhatsApp templates.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/settings",
    forwardQuery: false,
    errorLabel: "sales settings",
  });
}

export async function PUT(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "PUT",
    upstreamPath: "/api/v1/mutations/sales/settings",
    forwardQuery: false,
    errorLabel: "sales settings update",
  });
}
