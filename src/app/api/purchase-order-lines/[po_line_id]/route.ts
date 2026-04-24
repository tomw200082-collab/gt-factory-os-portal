import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/purchase-order-lines/[po_line_id]
//   → PATCH /api/v1/mutations/purchase-order-lines/{po_line_id}
//   Editable fields: notes, expected_receive_date
//   Role gate: planner or admin (enforced upstream)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ po_line_id: string }> },
): Promise<Response> {
  const { po_line_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/purchase-order-lines/${encodeURIComponent(po_line_id)}`,
    errorLabel: "purchase-order-line update",
  });
}
