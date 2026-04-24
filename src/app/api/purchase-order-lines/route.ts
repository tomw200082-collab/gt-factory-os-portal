import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/purchase-order-lines?po_id=<po_id> — proxy to Fastify API
//   GET /api/v1/queries/purchase-order-lines?po_id=<po_id>
//
// Returns all lines for a given PO. po_id query param is required.
// forwardQuery=true (default for GET) so ?po_id=... passes through.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/purchase-order-lines",
    errorLabel: "purchase-order-lines list",
  });
}
