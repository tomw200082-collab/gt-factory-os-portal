import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/purchase-orders/[po_id]/history — proxy to Fastify API
//   GET /api/v1/queries/purchase-orders/{po_id}/history
//
// Returns change_log audit events for the PO header and all its lines,
// newest-first, capped at 200 rows. Any authenticated role may read.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/purchase-orders/${encodeURIComponent(po_id)}/history`,
    errorLabel: "purchase-order history",
  });
}
