import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/settings/history?key= → GET /api/v1/queries/sales/settings/history?key=
// One settings key's last 20 changes (D-045). Managers only.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/settings/history",
    forwardQuery: true,
    errorLabel: "sales settings history",
  });
}
