import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/flow/item/[itemId] — Per-item drill-down detail.
//
// Proxies to upstream Fastify API:
//   GET /api/v1/queries/inventory/flow/item/:item_id
//
// Returns header item info + 14-day order list (orders[]) + open POs (pos[]).
// Operator + Planner + Admin may read.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
): Promise<Response> {
  const { itemId } = await ctx.params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/inventory/flow/item/${encodeURIComponent(itemId)}`,
    forwardQuery: true,
    errorLabel: "inventory flow item detail",
  });
}
