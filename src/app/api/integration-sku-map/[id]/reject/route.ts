import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/integration-sku-map/[id]/reject — proxy to Fastify
//   POST /api/v1/mutations/integration-sku-map/:alias_id/reject
//
// AMMC v1 Slice 2: admin-only reject of a pending integration_sku_map row.
// Body carries { if_match_updated_at, idempotency_key, reason? }.
// 409 STALE_ROW | STATUS_ALREADY surfaced from upstream.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/integration-sku-map/${encodeURIComponent(id)}/reject`,
    errorLabel: "sku alias reject",
  });
}
