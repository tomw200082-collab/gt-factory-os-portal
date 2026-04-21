import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-actuals/open?item_id=... — proxy to Fastify API
//   GET /api/v1/queries/production-actuals/open
//
// Form-open snapshot: server resolves items.primary_bom_head_id →
// bom_head.active_version_id → bom_lines, returns the version_id the client
// must carry back on submit (staleness protection). forwardQuery=true
// (default for GET) so ?item_id=... passes through.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-actuals/open",
    errorLabel: "production-actual open",
  });
}
