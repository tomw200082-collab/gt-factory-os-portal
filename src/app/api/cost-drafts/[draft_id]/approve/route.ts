import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/cost-drafts/[draft_id]/approve — mutation proxy (Tranche 043).
//
// POST → Fastify POST /api/v1/mutations/cost-drafts/:id/approve
//        (admin-only; body carries idempotency_key + optional note).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ draft_id: string }> },
): Promise<Response> {
  const { draft_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/cost-drafts/${encodeURIComponent(draft_id)}/approve`,
    errorLabel: "cost-draft approve",
  });
}
