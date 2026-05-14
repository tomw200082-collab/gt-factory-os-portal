import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/economics/component-costs/[component_id] — proxy to Fastify
//   PATCH /api/v1/mutations/economics/component-costs/:component_id
//
// Phase 10A: admin-only update of the fallback std_cost_per_inv_uom on a
// component. The active effective cost may still come from supplier_items
// when a primary supplier exists; the UI surfaces that distinction.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ component_id: string }> },
): Promise<Response> {
  const { component_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/economics/component-costs/${encodeURIComponent(component_id)}`,
    errorLabel: "component cost update",
  });
}
