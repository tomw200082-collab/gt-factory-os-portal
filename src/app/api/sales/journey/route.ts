import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/journey → GET /api/v1/queries/sales/journey
// The lead line's automatic sequence, read-only (D-044): each message's exact text, when
// it goes out, and whether the line is live or in test mode. Managers only (admin or
// planner): the server answers 403 to a sales rep.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/journey",
    forwardQuery: false,
    errorLabel: "sales journey",
  });
}
