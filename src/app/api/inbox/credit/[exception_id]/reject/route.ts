import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/inbox/credit/[exception_id]/reject
//
// Portal proxy for the LionWheel credit-needed Reject action.
//
// Upstream (LIVE on Railway as of 2026-05-02 per signal #28
// RUNTIME_READY(LionWheelCreditDecisionBackend), evidence pack
// Projects/gt-factory-os/.claude/evidence/credit_decisions_handlers_2026-05-02.txt):
//   POST /api/v1/mutations/lionwheel/credit-needed/:exception_id/reject
//
// Authority:
//   - W4 Doc B §3.3 (docs/integrations/lionwheel_credit_inbox_contract.md)
//   - Plan-of-record §Chunk C.3
//     (docs/post_recovery_advance_plan_2026-05-02.md)
//   - W1 backend schemas: api/src/inbox/credit_decisions/schemas.ts
//     (request body = { idempotency_key, reason } — reason REQUIRED min 5
//     chars; exception_id is in URL, NOT body — replaces the prior stub
//     which included exception_id in body)
//
// Role gate enforced upstream: planner | admin only (operator/viewer = 403).
// 422 returned upstream when reason is missing or under 5 chars.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ exception_id: string }> },
): Promise<Response> {
  const { exception_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/lionwheel/credit-needed/${encodeURIComponent(exception_id)}/reject`,
    errorLabel: "credit-needed reject",
  });
}
