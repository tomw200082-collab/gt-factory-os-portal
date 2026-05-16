import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/economics/sale-prices/[item_id]/history — proxy to Fastify
//   GET /api/v1/queries/economics/sale-prices/:item_id/history
//
// Returns the FG average sale-price history for one item (history drawer).
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ item_id: string }> },
): Promise<Response> {
  const { item_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/economics/sale-prices/${encodeURIComponent(item_id)}/history`,
    errorLabel: "economics sale-price history",
  });
}
