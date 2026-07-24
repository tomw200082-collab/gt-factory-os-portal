import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/purchase-orders/[po_id]/switch-supplier — proxy to Fastify API
//   POST /api/v1/mutations/purchase-orders/{po_id}/switch-supplier
//
// Tranche 140 raw-material-first: the office manager switches a whole
// APPROVED_TO_ORDER PO to another supplier (optional reason) before placing it.
// Role gate (enforced upstream): planner or admin. 200 { row } on success;
// 409 for PO_NOT_SWITCHABLE / SAME_SUPPLIER / SUPPLIER_NOT_FOUND /
// SUPPLIER_CANNOT_FULFILL; 404 if not found.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(
      po_id,
    )}/switch-supplier`,
    errorLabel: "purchase-order supplier switch",
  });
}
