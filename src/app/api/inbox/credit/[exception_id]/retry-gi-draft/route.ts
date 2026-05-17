import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/inbox/credit/[exception_id]/retry-gi-draft
//
// Portal proxy for the LionWheel credit-needed "retry Green Invoice draft"
// action.
//
// Upstream:
//   POST /api/v1/mutations/lionwheel/credit-needed/:exception_id/retry-gi-draft
//
// Re-runs the Green Invoice credit-draft creation for an already-approved
// credit whose draft is stuck at pending_gi_action (transient Morning outage,
// original invoice issued late, etc.). No request body. Role gate enforced
// upstream: planner | admin only. The response mirrors the approve body —
// { status, gi_draft, ... } — so the detail page reuses the same outcome
// rendering.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ exception_id: string }> },
): Promise<Response> {
  const { exception_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/lionwheel/credit-needed/${encodeURIComponent(exception_id)}/retry-gi-draft`,
    errorLabel: "credit-needed retry-gi-draft",
  });
}
