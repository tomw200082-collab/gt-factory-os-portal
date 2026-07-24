import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-runs/[run_id]/pick-confirm — proxy to Fastify API
//   POST /api/v1/mutations/production-runs/:run_id/pick-confirm
//
// Confirms the collected materials → the backend posts PICK_CONSUMPTION ledger
// rows (stock decrements at pick time). Body carries the pinned BOM version ids
// + per-line picks { component_id, source, picked_qty, state }. Physical truth
// wins: shortage/excess flag but never block. 409 STALE_(BASE_)BOM_VERSION and
// 503 break-glass are surfaced to the operator by the page. Bearer JWT
// forwarded by proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/production-runs/${encodeURIComponent(run_id)}/pick-confirm`,
    errorLabel: "production run pick-confirm",
  });
}
