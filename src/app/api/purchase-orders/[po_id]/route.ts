import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/purchase-orders/[po_id] — proxy to Fastify API
//   GET /api/v1/queries/purchase-orders/{po_id}
//
// Read-only PO detail for the planner detail surface. Any authenticated role
// may read (gating mirrors the list proxy + the (po)/layout RoleGate).
//
// Pure transport: forwards the upstream response unchanged. If the upstream
// has not yet exposed this endpoint, this proxy returns whatever upstream
// answered (typically 404) and the page surface displays it via the
// T009 error boundary — honest about the gap, not fabrication.
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
