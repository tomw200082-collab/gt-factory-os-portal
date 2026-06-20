import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/purchase-orders/[po_id]/place — proxy to Fastify API
//   POST /api/v1/mutations/purchase-orders/{po_id}/place
//
// Office-manager place-order (tranche 086 Part A): transitions a PO from
// APPROVED_TO_ORDER → OPEN, snapshotting payment terms + per-line prices.
// Role gate (enforced upstream): planner or admin. 200 { row } on success;
// 409 if the PO is not APPROVED_TO_ORDER; 404 if not found.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(po_id)}/place`,
    errorLabel: "purchase-order place",
  });
}
