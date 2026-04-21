import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/items/[item_id]/readiness — proxy to Fastify
//   GET /api/v1/queries/items/:item_id/readiness
//
// AMMC v1 Slice 1: single-item full readiness payload. Returns the same
// { is_ready, readiness_summary?, blockers[] } shape <ReadinessCard>
// consumes. Read-only; all roles allowed upstream.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ item_id: string }> },
): Promise<Response> {
  const { item_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/items/${encodeURIComponent(item_id)}/readiness`,
    errorLabel: "item readiness",
  });
}
