import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/economics/sale-price/[item_id] — proxy to Fastify
//   PATCH /api/v1/mutations/economics/sale-price/:item_id
//
// Sets the manual average sale price on an FG item
// (items.manual_avg_sale_price_ils, migration 0207). planner + admin only,
// enforced server-side. The value feeds v_fg_economics directly, so the
// economics read surface reflects it (and the derived margins) immediately.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ item_id: string }> },
): Promise<Response> {
  const { item_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/economics/sale-price/${encodeURIComponent(item_id)}`,
    errorLabel: "sale price update",
  });
}
