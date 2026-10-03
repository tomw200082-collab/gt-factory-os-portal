import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/menus → GET /api/v1/queries/sales/menus
// The menu file per line and its state (D-045): the server checks each file with a HEAD
// request, cached for 10 minutes. Managers only: the server answers 403 to a sales rep.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/menus",
    forwardQuery: false,
    errorLabel: "sales menus",
  });
}
