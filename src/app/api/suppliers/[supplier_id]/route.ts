import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/suppliers/[supplier_id] — proxy to Fastify
//   PATCH /api/v1/mutations/suppliers/:supplier_id
//
// AMMC v1 Slice 2: admin-only update of an existing suppliers row. Body
// carries { if_match_updated_at, idempotency_key, ...fields }.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ supplier_id: string }> },
): Promise<Response> {
  const { supplier_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/suppliers/${encodeURIComponent(supplier_id)}`,
    errorLabel: "suppliers update",
  });
}
