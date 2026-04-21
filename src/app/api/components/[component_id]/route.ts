import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/components/[component_id] — proxy to Fastify
//   PATCH /api/v1/mutations/components/:component_id
//
// AMMC v1 Slice 2: admin-only update of an existing components row. Body
// carries { if_match_updated_at, idempotency_key, ...fields }.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ component_id: string }> },
): Promise<Response> {
  const { component_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/components/${encodeURIComponent(component_id)}`,
    errorLabel: "components update",
  });
}
