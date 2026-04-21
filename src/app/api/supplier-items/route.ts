import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/supplier-items — proxy to GET /api/v1/queries/supplier-items
//
// Endgame Phase D1: feeds the admin supplier-items read surface.
// Upstream endpoint requires one-of (?supplier_id= | ?component_id= |
// ?item_id=) filter — 422 otherwise. The admin page renders a supplier
// picker first and then fetches supplier-items per supplier.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/supplier-items",
    errorLabel: "supplier-items list",
  });
}
