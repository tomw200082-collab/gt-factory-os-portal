import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/boms/lines — proxy to Fastify
//   GET /api/v1/queries/boms/lines
//
// AMMC v1 Slice 5 UI: BOM lines read-only list, used by the Product 360
// Components tab to render the expanded active-version BOM. Upstream
// REQUIRES ?bom_version_id=<uuid>; unfiltered requests 422. Pass-through.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/boms/lines",
    errorLabel: "bom lines list",
  });
}
