import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-actuals/[submission_id]/reverse — proxy to Fastify API
//   POST /api/v1/mutations/production-actuals/:submission_id/reverse
//   (Tranche 050, B5 — the safety net)
//
// Admin-only upstream (403 for other roles). Body carries
// { idempotency_key, reason } — reason is REQUIRED and recorded on
// production_actual.reversal_reason. Idempotent; 409 ALREADY_REVERSED when
// the report was already reversed. Original ledger rows are never touched —
// the handler posts mirrored *_REVERSAL rows (append-only ledger lock).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ submission_id: string }> },
): Promise<Response> {
  const { submission_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/production-actuals/${encodeURIComponent(submission_id)}/reverse`,
    errorLabel: "production-actual reverse",
  });
}
