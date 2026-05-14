import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/economics/component-costs — proxy to Fastify
//   GET /api/v1/queries/economics/component-costs
//
// Phase 10A: returns effective cost per component, indicating whether the
// active value comes from supplier_items (primary) or the components fallback.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/economics/component-costs",
    errorLabel: "component costs list",
  });
}
