import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/integration-sku-map/[id]/revoke — proxy to Fastify
//   POST /api/v1/mutations/integration-sku-map/:alias_id/revoke
//
// AMMC v1 Slice 2: admin-only revoke of an approved alias. Body carries
// { if_match_updated_at, idempotency_key, reason? }. Upstream handler emits
// an `alias_revoked_with_dependencies` warning exception when the alias has
// active order references (does NOT block the revoke per plan §D.2). 409
// STALE_ROW | INVALID_TRANSITION surfaced from upstream.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/integration-sku-map/${encodeURIComponent(id)}/revoke`,
    errorLabel: "sku alias revoke",
  });
}
