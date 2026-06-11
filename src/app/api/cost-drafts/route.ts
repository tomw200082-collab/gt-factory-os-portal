import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/cost-drafts — read proxy (Tranche 043, Price Truth).
//
// GET → Fastify GET /api/v1/queries/cost-drafts (pending first; optional
//       ?status=… repeatable filter, ?supplier_item_id, ?limit forwarded
//       verbatim as query params).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/cost-drafts",
    errorLabel: "cost-drafts list",
  });
}
