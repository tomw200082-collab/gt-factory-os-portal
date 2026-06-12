import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/orders/outbound-summary
//
// Mirror-only proxy to upstream Fastify API:
//   GET /api/v1/queries/orders/outbound-summary
//
// Feeds the dashboard Flow Ribbon OUTBOUND node (Tranche 063 — LionWheel
// mirror activation, Tom dispatch 2026-06-12). Response shape (per
// api/src/orders/schemas.ts OutboundSummaryResponse):
//   { open_orders: number, due_today: number, as_of: string }
//
// All four roles allowed upstream. The dashboard degrades the node to its
// quiet state on any upstream failure (e.g. until the backend Railway
// deploy that ships this endpoint), so this proxy must never fabricate.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/orders/outbound-summary",
    forwardQuery: false,
    errorLabel: "orders outbound-summary",
  });
}
