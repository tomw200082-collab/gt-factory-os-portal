import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/planning/recommendations/:id/convert-to-po
//
// Endgame Phase C1 (crystalline-drifting-dusk §B.C1): creates the portal-side
// proxy for the Gate 5 Phase 9 recommendation -> PO bridge endpoint.
//
// Upstream contract: POST /api/v1/mutations/planning/recommendations/:id/
// convert-to-po (docs/gate5_phase9_po_bridge_checkpoint.md). Body envelope:
//   { idempotency_key: string }
// Upstream role gate: planner + admin (403 for operator + viewer).
// Upstream 409 reasons include NOT_APPROVED, ALREADY_CONVERTED.
//
// Forwards Supabase Bearer JWT via proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/planning/recommendations/${encodeURIComponent(id)}/convert-to-po`,
    errorLabel: "planning recommendation convert-to-po",
  });
}
