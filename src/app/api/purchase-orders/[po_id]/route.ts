import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET   /api/purchase-orders/[po_id] → GET /api/v1/queries/purchase-orders/{po_id}
// PATCH /api/purchase-orders/[po_id] → PATCH /api/v1/mutations/purchase-orders/{po_id}
//   Allowed body fields: notes, expected_receive_date
//   Role gate: planner or admin (enforced upstream)
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/purchase-orders/${encodeURIComponent(po_id)}`,
    errorLabel: "purchase-order detail",
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(po_id)}`,
    errorLabel: "purchase-order update",
  });
}
