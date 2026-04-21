import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/integration-sku-map/approve — proxy to Fastify API
//   POST /api/v1/mutations/integration-sku-map/approve
//
// Endgame Phase E1-UI (crystalline-drifting-dusk §B.E1): batch-approve
// external-SKU → item_id aliases from the admin /admin/sku-aliases review
// surface. Approved rows auto-resolve any matching lionwheel_unknown_sku
// exceptions upstream (handled by W1 E1-backend handler, not here).
// Body is forwarded as-is (default forwardBody for POST); Supabase Bearer JWT
// attached by proxyRequest; auth + admin role-gate enforced upstream.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/integration-sku-map/approve",
    errorLabel: "sku alias approve",
  });
}
