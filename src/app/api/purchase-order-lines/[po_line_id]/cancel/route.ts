import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/purchase-order-lines/[po_line_id]/cancel — proxy to Fastify API
//   POST /api/v1/mutations/purchase-order-lines/{po_line_id}/cancel
//
// Cancels an OPEN PO line (received_qty = 0). Role gate: planner or admin.
// Returns 200 { row } on success, 409 if not OPEN, 404 if not found.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ po_line_id: string }> },
): Promise<Response> {
  const { po_line_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-order-lines/${encodeURIComponent(po_line_id)}/cancel`,
    errorLabel: "purchase-order-line cancel",
  });
}
