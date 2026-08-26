import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/components/unused — proxy to Fastify
//   GET /api/v1/queries/components/unused
//
// Components no live BOM consumes (backend migration 0302). Backs the
// "Unused components" tab on /admin/masters/archive so orphaned RM/PKG stock
// is visible and disposable instead of rotting invisibly.
//
// Static segment, so it takes precedence over ./[component_id]/route.ts.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/components/unused",
    errorLabel: "unused components list",
  });
}
