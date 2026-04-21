import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/items/[item_id]/status — proxy to Fastify
//   POST /api/v1/mutations/items/:item_id/status
//
// AMMC v1 Slice 2: admin-only status toggle. Body carries { status,
// if_match_updated_at, idempotency_key }. 409 STALE_ROW | STATUS_ALREADY |
// REFERENTIAL_BLOCK surfaced from upstream.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ item_id: string }> },
): Promise<Response> {
  const { item_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/items/${encodeURIComponent(item_id)}/status`,
    errorLabel: "items status",
  });
}
