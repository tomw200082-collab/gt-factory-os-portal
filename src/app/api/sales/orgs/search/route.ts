import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/orgs/search?q= → GET /api/v1/queries/sales/orgs/search
// The lean {id, name, phone} index the command palette and the list search use.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/orgs/search",
    forwardQuery: true,
    errorLabel: "sales orgs search",
  });
}
