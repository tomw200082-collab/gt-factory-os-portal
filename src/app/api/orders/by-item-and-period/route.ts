import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/orders/by-item-and-period
//
// Read-only proxy to upstream Fastify API:
//   GET /api/v1/queries/orders/by-item-and-period?from=&to=&cadence=&items=
//
// Returns per-item × period-bucket sold quantities aggregated from the
// LionWheel orders mirror (resolved, non-retired lines only). Response shape
// (per api/src/orders/schemas.ts OrdersByItemAndPeriodResult):
//   { rows: [{ item_id, period_bucket_key, qty_total, order_count,
//              sample_orders[] }], bucket_cadence }
//
// All four roles allowed upstream (viewer:read). Powers the Product Decision
// Board velocity axis (Tranche 080) — units-sold is the dimension /economics
// alone cannot supply. Query string is forwarded verbatim (from/to/cadence).
// This proxy never fabricates: on upstream failure the board degrades the
// velocity axis to "—" rather than inventing sales.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/orders/by-item-and-period",
    forwardQuery: true,
    errorLabel: "orders by-item-and-period",
  });
}
