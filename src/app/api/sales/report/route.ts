import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/report → GET /api/v1/queries/sales/report
// The sales report: the Artifact's data blob, how fresh it is, and whether it is stale.
// Managers only (admin or planner): the server answers 403 to a sales rep, and the page
// never asks on a rep's behalf.

export async function GET(req: Request): Promise<Response> {
  const res = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/report",
    forwardQuery: false,
    errorLabel: "sales report",
  });
  // The blob is the whole customer book: no shared cache or browser history may keep a copy.
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
