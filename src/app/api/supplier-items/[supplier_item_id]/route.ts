import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/supplier-items/[supplier_item_id] — proxy to Fastify
//   PATCH /api/v1/mutations/supplier-items/:supplier_item_id
//
// AMMC v1 Slice 2: admin-only update. Body carries { if_match_updated_at,
// idempotency_key, ...fields }. 409 STALE_ROW | UNIQUE_VIOLATION
// (primary-per-component / primary-per-item partial-unique index).
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ supplier_item_id: string }> },
): Promise<Response> {
  const { supplier_item_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/supplier-items/${encodeURIComponent(supplier_item_id)}`,
    errorLabel: "supplier-items update",
  });
}
