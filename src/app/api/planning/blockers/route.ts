// ---------------------------------------------------------------------------
// Portal proxy: GET /api/planning/blockers → upstream
//   GET /api/v1/queries/planning/blockers
//
// Forwards the full querystring (run_id, severity[], category[], item_id,
// page, page_size). No body. Auth handled by proxyRequest via Supabase
// session cookies.
// ---------------------------------------------------------------------------

import { proxyRequest } from "@/lib/api-proxy";

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/planning/blockers",
    errorLabel: "planning blockers",
  });
}
