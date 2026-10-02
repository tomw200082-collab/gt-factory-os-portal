import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/orgs/page?filter=&sort=&cursor=&limit=
//   → GET /api/v1/queries/sales/orgs/page (GT Pulse Unit B: server-side filter, sort and keyset paging)

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/orgs/page",
    forwardQuery: true,
    errorLabel: "sales orgs page",
  });
}
