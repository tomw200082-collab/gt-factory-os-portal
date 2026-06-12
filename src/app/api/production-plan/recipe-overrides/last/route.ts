import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-plan/recipe-overrides/last?item_id=...
//   → /api/v1/queries/production-plan/recipe-overrides/last
//
// "Load the last improvisation for this product" convenience read: the most
// recent recipe-override row (by updated_at) for the item, regardless of
// which plan carried it. forwardQuery=true (GET default) passes ?item_id=
// through. Backend: gt-factory-os/api/src/plan-recipe/handler.ts
// handleLastOverride (0237).
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-plan/recipe-overrides/last",
    errorLabel: "last recipe override read",
  });
}
