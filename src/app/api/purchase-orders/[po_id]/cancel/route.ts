import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/purchase-orders/[po_id]/cancel — proxy to Fastify API
//   POST /api/v1/mutations/purchase-orders/{po_id}/cancel
//
// Cancels a DRAFT or OPEN purchase order. Role gate: planner or admin.
// Returns 200 { row } on success; 409 if status is not DRAFT/OPEN;
// 404 if not found.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(po_id)}/cancel`,
    errorLabel: "purchase-order cancel",
  });
}
