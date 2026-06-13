import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/credit-tracking/[credit_task_id]/resolution — proxy to Fastify
//   POST /api/v1/mutations/credit-tracking/:credit_task_id/resolution
//
// Body: { status: "PENDING"|"CREDITED"|"DEFERRED"|"SUPPLIED", note?: string }
// Upstream allows roles admin + viewer (the bookkeeper holds viewer; this
// single mutation is a documented exception — bookkeeping workflow state
// only, audited via change_log CREDIT_TASK_RESOLUTION_CHANGED).
// Backend: api/src/credit_tracking/route.ts (migration 0241).
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ credit_task_id: string }> },
): Promise<Response> {
  const { credit_task_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/credit-tracking/${encodeURIComponent(credit_task_id)}/resolution`,
    errorLabel: "credit tracking resolution",
  });
}
