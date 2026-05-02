import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/inbox/credit/[exception_id]/approve
//
// Portal proxy for the LionWheel credit-needed Approve action.
//
// Upstream (LIVE on Railway as of 2026-05-02 per signal #28
// RUNTIME_READY(LionWheelCreditDecisionBackend), evidence pack
// Projects/gt-factory-os/.claude/evidence/credit_decisions_handlers_2026-05-02.txt):
//   POST /api/v1/mutations/lionwheel/credit-needed/:exception_id/approve
//
// Authority:
//   - W4 Doc B §3.2 (docs/integrations/lionwheel_credit_inbox_contract.md)
//   - Plan-of-record §Chunk C.3
//     (docs/post_recovery_advance_plan_2026-05-02.md)
//   - W1 backend schemas: api/src/inbox/credit_decisions/schemas.ts
//     (request body = { idempotency_key, reason? }; exception_id is in URL,
//     NOT body — replaces the prior stub which included exception_id in body)
//
// Role gate enforced upstream: planner | admin only (operator/viewer = 403).
// SC-A3 invariant enforced upstream: handler stops at state='pending_gi_action'
// with NO Green Invoice API call.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ exception_id: string }> },
): Promise<Response> {
  const { exception_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/lionwheel/credit-needed/${encodeURIComponent(exception_id)}/approve`,
    errorLabel: "credit-needed approve",
  });
}
