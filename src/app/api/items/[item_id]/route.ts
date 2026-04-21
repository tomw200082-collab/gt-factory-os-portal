import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/items/[item_id] — proxy to Fastify
//   PATCH /api/v1/mutations/items/:item_id
//
// AMMC v1 Slice 2: admin-only update of an existing items row. Body carries
// { if_match_updated_at, idempotency_key, ...fields }. 409 STALE_ROW |
// SUPPLY_METHOD_LOCKED | NOT_FOUND surfaced from upstream.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ item_id: string }> },
): Promise<Response> {
  const { item_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/items/${encodeURIComponent(item_id)}`,
    errorLabel: "items update",
  });
}
