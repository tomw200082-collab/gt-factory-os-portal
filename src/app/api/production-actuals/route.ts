import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-actuals — proxy to Fastify API
//   POST /api/v1/mutations/production-actuals
//
// Contract: CLAUDE.md §"Production reporting v1" locked semantics.
// Operator submits { idempotency_key, event_at, item_id, bom_version_id_pinned,
// output_qty, scrap_qty, output_uom, notes }. Handler resolves pinned BOM,
// validates staleness, posts consumption + output + optional scrap rows to
// stock_ledger in a single transaction. Supabase Bearer JWT forwarded by
// proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/production-actuals",
    errorLabel: "production-actual submit",
  });
}
