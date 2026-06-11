import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/production-plan/[plan_id]/recipe — per-plan improvised liquid recipe.
//
// GET    → /api/v1/queries/production-plan/:plan_id/recipe
//          Effective liquid recipe (override when customized, standard BASE
//          leaf set otherwise) + availability + diff context.
// PUT    → /api/v1/mutations/production-plan/:plan_id/recipe
//          Full replacement of the liquid line set. Body carries the
//          idempotency_key envelope (form_type='plan_recipe_override').
//          lines:[] clears the override.
// DELETE → /api/v1/mutations/production-plan/:plan_id/recipe
//          Clears the override (naturally idempotent; no envelope).
//
// Backend: gt-factory-os/api/src/plan-recipe/{schemas,handler,route}.ts (0237).
// Only the LIQUID (BASE-head) side is editable; packaging always consumes per
// the standard BOM — the server rejects packaging-class components with 409
// COMPONENT_IS_PACKAGING.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/production-plan/${encodeURIComponent(plan_id)}/recipe`,
    errorLabel: "plan recipe read",
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "PUT",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}/recipe`,
    errorLabel: "plan recipe save",
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ plan_id: string }> },
): Promise<Response> {
  const { plan_id } = await params;
  return proxyRequest(req, {
    method: "DELETE",
    upstreamPath: `/api/v1/mutations/production-plan/${encodeURIComponent(plan_id)}/recipe`,
    errorLabel: "plan recipe clear",
  });
}
